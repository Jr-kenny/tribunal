// Read each judge's current reputation live off Casper.
//
// The Tribunal contract stores reputation in one Odra dictionary; the per-judge
// slot addresses are recovered once (from each judge's register_judge tx) into
// judge-rep-map.json by scripts/build-rep-map.mjs. The slots are stable, so here
// we just read each slot's current value via query_global_state and decode the
// stored u32 (basis points). No transaction, no mutation: a plain on-chain read.

import { config } from "./config.js";
import { JUDGE_REP_MAP } from "./judge-rep-map.js";

export interface JudgeReputation {
  key: string; // facet key: authenticity | solvency | custodian | valuation
  bps: number; // reputation in basis points (0..10000), or null if unreadable
}

function repMap(): Record<string, string> {
  return JUDGE_REP_MAP;
}

/** Decode the Odra-stored u32 from a dictionary item's CLValue bytes.
 * A direct query returns the slot as a length-prefixed byte string:
 * [4-byte LE length][value bytes LE]. Reputation is a u32, so 4 value bytes. */
function decodeU32(hexBytes: string): number {
  const data = hexBytes.slice(8); // drop the 4-byte length prefix
  const le = data.slice(0, 8); // u32 = 4 bytes
  const be = le.match(/../g)!.reverse().join("");
  return parseInt(be, 16);
}

async function queryDictionaryValueBytes(addr: string): Promise<string | null> {
  const res = await fetch(config.casperPublicNodeUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "query_global_state",
      params: { state_identifier: null, key: `dictionary-${addr}`, path: [] },
    }),
  });
  const j = await res.json();
  const bytes = j?.result?.stored_value?.CLValue?.bytes;
  return typeof bytes === "string" ? bytes : null;
}

/** Read one judge's current reputation (bps), or null if the slot can't be read. */
export async function readReputation(facetKey: string): Promise<number | null> {
  const addr = repMap()[facetKey];
  if (!addr) return null;
  const bytes = await queryDictionaryValueBytes(addr);
  if (!bytes) return null;
  return decodeU32(bytes);
}

/** Read every judge's current reputation, in descending order. */
export async function readAllReputation(): Promise<JudgeReputation[]> {
  const map = repMap();
  const out: JudgeReputation[] = [];
  for (const key of Object.keys(map)) {
    const bytes = await queryDictionaryValueBytes(map[key]);
    out.push({ key, bps: bytes ? decodeU32(bytes) : (null as unknown as number) });
  }
  out.sort((a, b) => (b.bps ?? -1) - (a.bps ?? -1));
  return out;
}
