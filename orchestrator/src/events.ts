// Read the registry's claim events straight off Casper's event log.
//
// The contract emits ClaimOpened / ClaimFinalized via the Casper Event Standard,
// which stores them in the `__events` dictionary (count in `__events_length`). We
// read each by index over a public node and decode it, so the registry sees every
// claim no matter who created it, with no dependency on an external indexer.

import { config } from "./config.js";

// Contract (entity) hash for the current deploy. The package hash lives in
// TRIBUNAL_CONTRACT_HASH; this is its active contract version, used to read named
// state. Regenerated alongside the rep map on redeploy (see build-rep-map.mjs).
const ENTITY_HASH =
  process.env.TRIBUNAL_ENTITY_HASH ||
  "hash-4452b94adf6a7d5e0be11b508c98197605c04908d265cfb48c24df079836239b";

const STATUS = ["Open", "Backed", "Disputed", "NotBacked"] as const;
export type ClaimStatus = (typeof STATUS)[number];

export interface ClaimRecord {
  claimId: number;
  asset?: string;
  evidenceUri?: string;
  evidenceHash?: string;
  submitter?: string;
  status: ClaimStatus;
  score?: number;
}

// the public testnet node throws intermittent connect-timeouts; retry through them.
async function rpc(method: string, params: unknown, tries = 4): Promise<any> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    try {
      const r = await fetch(config.casperPublicNodeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      return await r.json();
    } catch (e) {
      lastErr = e;
      if (attempt < tries) await new Promise((res) => setTimeout(res, 1500 * attempt));
    }
  }
  throw lastErr;
}

// little-endian byte-string reader over a hex payload
class Reader {
  private off = 0;
  constructor(private hex: string) {}
  u8(): number {
    const v = parseInt(this.hex.slice(this.off, this.off + 2), 16);
    this.off += 2;
    return v;
  }
  u32(): number {
    const le = this.hex.slice(this.off, this.off + 8);
    this.off += 8;
    return parseInt(le.match(/../g)!.reverse().join(""), 16);
  }
  u64(): number {
    const le = this.hex.slice(this.off, this.off + 16);
    this.off += 16;
    return Number(BigInt("0x" + le.match(/../g)!.reverse().join("")));
  }
  str(): string {
    const n = this.u32();
    const bytes = this.hex.slice(this.off, this.off + n * 2);
    this.off += n * 2;
    return Buffer.from(bytes, "hex").toString("utf8");
  }
  keyHex(): string {
    this.u8(); // key tag (account/hash)
    const h = this.hex.slice(this.off, this.off + 64);
    this.off += 64;
    return h;
  }
}

interface DecodedEvent {
  name: string;
  claimId: number;
  asset?: string;
  evidenceUri?: string;
  evidenceHash?: string;
  submitter?: string;
  status?: ClaimStatus;
  score?: number;
}

function decodeEvent(listBytesHex: string): DecodedEvent | null {
  const r = new Reader(listBytesHex);
  r.u32(); // List<U8> length prefix
  const name = r.str(); // e.g. "event_ClaimOpened"
  if (name === "event_ClaimOpened") {
    return {
      name,
      claimId: r.u64(),
      asset: r.str(),
      evidenceUri: r.str(),
      evidenceHash: r.str(),
      submitter: r.keyHex(),
    };
  }
  if (name === "event_ClaimFinalized") {
    const claimId = r.u64();
    const status = STATUS[r.u8()] ?? "Open";
    const score = r.u32();
    return { name, claimId, status, score };
  }
  return null;
}

async function eventsLength(srh: string): Promise<number> {
  const j = await rpc("query_global_state", {
    state_identifier: { StateRootHash: srh },
    key: ENTITY_HASH,
    path: ["__events_length"],
  });
  return Number(j?.result?.stored_value?.CLValue?.parsed ?? 0);
}

async function eventBytes(srh: string, index: number): Promise<string | null> {
  const j = await rpc("state_get_dictionary_item", {
    state_root_hash: srh,
    dictionary_identifier: {
      ContractNamedKey: { key: ENTITY_HASH, dictionary_name: "__events", dictionary_item_key: String(index) },
    },
  });
  const bytes = j?.result?.stored_value?.CLValue?.bytes;
  return typeof bytes === "string" ? bytes : null;
}

/** Read the whole claim registry from the event log, newest first. */
export async function readClaimEvents(): Promise<ClaimRecord[]> {
  const srh = (await rpc("chain_get_state_root_hash", {}))?.result?.state_root_hash;
  if (!srh) return [];
  const n = await eventsLength(srh);

  const claims = new Map<number, ClaimRecord>();
  for (let i = 0; i < n; i += 1) {
    const bytes = await eventBytes(srh, i);
    if (!bytes) continue;
    const ev = decodeEvent(bytes);
    if (!ev) continue;
    if (ev.name === "event_ClaimOpened") {
      const existing = claims.get(ev.claimId);
      claims.set(ev.claimId, {
        claimId: ev.claimId,
        asset: ev.asset,
        evidenceUri: ev.evidenceUri,
        evidenceHash: ev.evidenceHash,
        submitter: ev.submitter,
        status: existing?.status ?? "Open",
        score: existing?.score,
      });
    } else if (ev.name === "event_ClaimFinalized") {
      const existing = claims.get(ev.claimId) ?? { claimId: ev.claimId, status: "Open" as ClaimStatus };
      claims.set(ev.claimId, { ...existing, status: ev.status ?? existing.status, score: ev.score });
    }
  }

  return [...claims.values()].sort((a, b) => b.claimId - a.claimId);
}
