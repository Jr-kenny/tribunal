// GenLayer half of the relay: run a facet judge, wait for ACCEPTED, read the
// verdict it stored, and report the GenLayer tx hash (the proof carried onto
// Casper). The flow is write the judge call, wait for ACCEPTED, then read back
// the verdict the judge committed to state.

import { readFileSync } from "node:fs";
import { createAccount, createClient } from "genlayer-js";
import { localnet, studionet, testnetAsimov, testnetBradbury } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import { config } from "./config.js";

export type Vote = "PASS" | "FAIL" | "UNCERTAIN";
export interface Verdict {
  vote: Vote;
  confidence: number; // basis points 0..10000
  reason: string;
}

function getChain(name: string) {
  switch (name) {
    case "localnet":
      return localnet;
    case "studionet":
      return studionet;
    case "testnet-asimov":
      return testnetAsimov;
    case "testnet-bradbury":
      return testnetBradbury;
    default:
      throw new Error(`Unsupported GENLAYER_NETWORK "${name}"`);
  }
}

function makeClient() {
  if (!config.genlayerDeployerKeyPath) throw new Error("Missing GENLAYER_DEPLOYER_KEY path");
  const chain = getChain(config.genlayerNetwork);
  const key = readFileSync(config.genlayerDeployerKeyPath, "utf8").trim();
  const account = createAccount(key as `0x${string}`);
  return createClient({ chain, account });
}

const ACCEPTED = { status: TransactionStatus.ACCEPTED, interval: 5_000, retries: 120 } as const;

/** Run the judge on a claim and return the GenLayer tx hash (the on-chain proof). */
export async function runJudge(judgeAddress: string, claimId: string, evidence: string): Promise<string> {
  const client = makeClient();
  const txHash = await client.writeContract({
    address: judgeAddress as `0x${string}`,
    functionName: "judge",
    args: [claimId, evidence],
    value: 0n,
  });
  await client.waitForTransactionReceipt({ hash: txHash, ...ACCEPTED });
  return txHash as string;
}

/** Read the verdict the judge stored, retrying while it settles to accepted state. */
export async function readVerdict(judgeAddress: string, claimId: string): Promise<Verdict> {
  const client = makeClient();
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const raw = await client.readContract({
      address: judgeAddress as `0x${string}`,
      functionName: "get_verdict",
      args: [claimId],
    });
    if (raw) return JSON.parse(raw as string) as Verdict;
    await new Promise((r) => setTimeout(r, 5_000));
  }
  throw new Error(`No verdict for claim ${claimId} after retries`);
}

/** Make the judge fetch a live USD market price under consensus, returning micro-USD. */
export async function readPrice(
  judgeAddress: string,
  claimId: string,
  coingeckoId: string,
): Promise<bigint> {
  const client = makeClient();
  const txHash = await client.writeContract({
    address: judgeAddress as `0x${string}`,
    functionName: "read_price",
    args: [claimId, coingeckoId],
    value: 0n,
  });
  await client.waitForTransactionReceipt({ hash: txHash, ...ACCEPTED });
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const raw = await client.readContract({
      address: judgeAddress as `0x${string}`,
      functionName: "get_price",
      args: [claimId],
    });
    if (raw) return BigInt(raw as string);
    await new Promise((r) => setTimeout(r, 5_000));
  }
  throw new Error(`No price read for claim ${claimId} after retries`);
}

/** Cross-chain read: make the judge fetch a Casper reserve balance under consensus. */
export async function readReserve(
  judgeAddress: string,
  claimId: string,
  casperNodeUrl: string,
  reservePublicKey: string,
): Promise<bigint> {
  const client = makeClient();
  const txHash = await client.writeContract({
    address: judgeAddress as `0x${string}`,
    functionName: "read_reserve",
    args: [claimId, casperNodeUrl, reservePublicKey],
    value: 0n,
  });
  await client.waitForTransactionReceipt({ hash: txHash, ...ACCEPTED });
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const raw = await client.readContract({
      address: judgeAddress as `0x${string}`,
      functionName: "get_reserve",
      args: [claimId],
    });
    if (raw) return BigInt(raw as string);
    await new Promise((r) => setTimeout(r, 5_000));
  }
  throw new Error(`No reserve read for claim ${claimId} after retries`);
}
