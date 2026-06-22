// Map each facet to its judge's on-chain Casper account hash, derived from the
// judge key files. The Tribunal contract keys reputation by account hash, so this
// is how the UI knows which on-chain identity each facet's reputation belongs to.

import { readFileSync } from "node:fs";
import * as CasperNS from "casper-js-sdk";
const C: typeof import("casper-js-sdk") = (CasperNS as any).default ?? CasperNS;

const FACET_KEYS = ["authenticity", "solvency", "custodian", "valuation"] as const;
export type JudgeFacet = (typeof FACET_KEYS)[number];

export interface JudgeAccount {
  key: JudgeFacet;
  publicKeyHex: string;
  accountHashHex: string; // 64-char hex, no "account-hash-" prefix
}

const keyPath = (facet: string) => `../.keys/casper/judges/${facet}.pem`;

/** Derive the account hash for one facet's judge key. */
export function judgeAccount(facet: JudgeFacet): JudgeAccount {
  const key = C.PrivateKey.fromPem(readFileSync(keyPath(facet), "utf8"), C.KeyAlgorithm.ED25519);
  const pub = key.publicKey;
  const accountHashHex = pub.accountHash().toHex().replace(/^account-hash-/, "");
  return { key: facet, publicKeyHex: pub.toHex(), accountHashHex };
}

/** Derive all four judge account hashes. */
export function judgeAccounts(): JudgeAccount[] {
  return FACET_KEYS.map(judgeAccount);
}
