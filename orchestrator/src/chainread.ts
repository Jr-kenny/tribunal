// Reading Casper state back so the relay never has to guess. Two jobs:
//  1. recover the claim id that open_claim assigned (from its own effects)
//  2. decode the finalized ClaimStatus (by diffing open vs finalize effects)
//
// Odra stores each field as a Write of an "Any" CLValue. We don't decode the full
// Odra layout, we use two robust facts: next_claim_id is the only 8-byte u64 it
// writes on open_claim, and claim_status[id] is the one key whose value changes
// between open_claim and finalize.

import C from "casper-js-sdk";
import { config } from "./config.js";

const STATUS = ["Open", "Backed", "Disputed", "NotBacked"] as const;
export type ClaimStatus = (typeof STATUS)[number];

function rpc() {
  return new C.RpcClient(new C.HttpHandler(config.casperNodeUrl));
}

async function executionResult(hash: string, tries = 30): Promise<any> {
  const client = rpc();
  for (let i = 0; i < tries; i += 1) {
    try {
      const r = await client.getTransactionByTransactionHash(hash);
      const info = (r as any)?.executionInfo?.executionResult;
      if (info) return JSON.parse(JSON.stringify(info, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
    } catch {
      /* not processed yet */
    }
    await new Promise((res) => setTimeout(res, 5_000));
  }
  throw new Error(`tx ${hash} not processed in time`);
}

/** Wait for a tx and throw if it reverted; returns the (plain) execution result. */
export async function confirm(hash: string): Promise<any> {
  const info = await executionResult(hash);
  if (info.errorMessage) throw new Error(`tx ${hash} reverted: ${info.errorMessage}`);
  return info;
}

function anyWrites(info: any): Map<string, string> {
  const m = new Map<string, string>();
  for (const e of info.effects ?? []) {
    const cl = e?.kind?.Write?.CLValue;
    if (cl && cl.cl_type === "Any" && typeof cl.bytes === "string") m.set(e.key, cl.bytes);
  }
  return m;
}

/** The claim id open_claim assigned = (new next_claim_id) - 1, read from effects. */
export function claimIdFromOpen(openInfo: any): number {
  const s = JSON.stringify(openInfo);
  const vals: number[] = [];
  for (const match of s.matchAll(/08000000([0-9a-f]{16})/g)) {
    const le = match[1].match(/../g)!.reverse().join("");
    const v = Number(BigInt("0x" + le));
    if (Number.isInteger(v) && v >= 0 && v < 1e9) vals.push(v);
  }
  if (vals.length === 0) throw new Error("could not recover claim id from open_claim effects");
  return Math.max(...vals) - 1;
}

/** The finalized status = the one Any-write whose value changed open -> finalize. */
export function statusFromDiff(openInfo: any, finalizeInfo: any): ClaimStatus {
  const open = anyWrites(openInfo);
  const fin = anyWrites(finalizeInfo);
  for (const [key, finVal] of fin) {
    if (!open.has(key) || open.get(key) === finVal) continue;
    const marker = finVal.indexOf("0e03");
    const variantHex = marker > 1 ? finVal.slice(marker - 2, marker) : finVal.slice(-2);
    const variant = parseInt(variantHex, 16);
    if (variant >= 0 && variant < STATUS.length) return STATUS[variant];
  }
  throw new Error("could not decode claim status from effects");
}
