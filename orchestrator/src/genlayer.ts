// GenLayer half of the relay: run a facet judge, wait for ACCEPTED, read the
// verdict it stored, and report the GenLayer tx hash (the proof carried onto
// Casper). The flow is write the judge call, wait for ACCEPTED, then read back
// the verdict the judge committed to state.

import { createAccount, createClient } from "genlayer-js";
import { localnet, studionet, testnetAsimov, testnetBradbury } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import { config } from "./config.js";
import { genlayerKeyValue } from "./keys.js";

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

// An ephemeral account for read-only view calls (get_verdict and friends). Reads
// don't sign anything, so when the real signing keys aren't present (the Vercel
// UI only reads), we still need *some* account to build the client. Writes run
// where the keys are set (Render), so they never hit this fallback.
const READ_ONLY_KEY = `0x${"1".repeat(64)}` as const;

// Each judge runs under its own GenLayer account so the four can fire concurrently
// without sharing one account's nonce. keyId is a facet ("authenticity"…) or
// "deployer"; resolved from env (cloud) or the local key file. Falls back to an
// ephemeral account when no key is configured, so reads work without the keys.
function makeClient(keyId: string = "deployer") {
  const chain = getChain(config.genlayerNetwork);
  let key: string;
  try {
    key = genlayerKeyValue(keyId);
  } catch {
    key = READ_ONLY_KEY;
  }
  const account = createAccount(key as `0x${string}`);
  return createClient({ chain, account });
}

const ACCEPTED = { status: TransactionStatus.ACCEPTED, interval: 5_000, retries: 120 } as const;

// GenLayer's RPC throws transient connect-timeouts ("fetch failed") under load.
// Those happen before the request reaches the server, so retrying is safe (no
// double-submit). Wrap each RPC call so a blip doesn't kill a whole panel run.
async function withRetry<T>(label: string, fn: () => Promise<T>, tries = 5): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const blob = `${(e as Error)?.message ?? ""} ${JSON.stringify(e)?.slice(0, 600) ?? ""}`;
      const transient = /fetch failed|timeout|ECONN|ETIMEDOUT|UND_ERR|socket hang|network/i.test(blob);
      if (!transient || attempt === tries) throw e;
      const delay = 2_000 * attempt;
      console.log(`  [retry] ${label}: transient RPC error, retrying in ${delay}ms (${attempt}/${tries - 1})`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

// All GenLayer RPC calls go through these so a transient blip retries instead of
// crashing the run. writes/waits/reads are idempotent here (keyed by claim id).
const rpcWrite = (client: ReturnType<typeof makeClient>, params: any) =>
  withRetry("writeContract", () => client.writeContract(params));
const rpcWait = (client: ReturnType<typeof makeClient>, params: any) =>
  withRetry("waitReceipt", () => client.waitForTransactionReceipt(params));
const rpcRead = (client: ReturnType<typeof makeClient>, params: any) =>
  withRetry("readContract", () => client.readContract(params));

// The get_* views raise "[EXPECTED] no <thing>" until the matching write is
// visible to reads (GenLayer has read-after-write lag against latest-nonfinal
// state). Poll, treating that raise (and transient blips) as "not ready yet".
async function pollRead(client: ReturnType<typeof makeClient>, params: any, tries = 24): Promise<unknown> {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      const raw = await rpcRead(client, params);
      if (raw) return raw;
    } catch (e) {
      const blob = `${(e as Error)?.message ?? ""} ${JSON.stringify(e)?.slice(0, 400) ?? ""}`;
      const notReady = /execution failed|EXPECTED|no verdict|no reserve|no price|no custodian|no attestation|not found|Missing or invalid/i.test(blob);
      if (!notReady) throw e;
    }
    await new Promise((r) => setTimeout(r, 5_000));
  }
  throw new Error(`read not available after ${tries} polls: ${params.functionName}`);
}

/** Run the judge on a claim and return the GenLayer tx hash (the on-chain proof). */
export async function runJudge(judgeAddress: string, claimId: string, evidence: string, keyId?: string): Promise<string> {
  const client = makeClient(keyId);
  const txHash = await rpcWrite(client, {
    address: judgeAddress as `0x${string}`,
    functionName: "judge",
    args: [claimId, evidence],
    value: 0n,
  });
  await rpcWait(client, { hash: txHash, ...ACCEPTED });
  return txHash as string;
}

/** Run the judge on a claim with a per-claim question (rubric), for claim types
 * beyond treasury. Returns the GenLayer tx hash. */
export async function runJudgeWithRubric(
  judgeAddress: string,
  claimId: string,
  evidence: string,
  facetName: string,
  rubric: string,
  keyId?: string,
): Promise<string> {
  const client = makeClient(keyId);
  const txHash = await rpcWrite(client, {
    address: judgeAddress as `0x${string}`,
    functionName: "judge_with_rubric",
    args: [claimId, evidence, facetName, rubric],
    value: 0n,
  });
  await rpcWait(client, { hash: txHash, ...ACCEPTED });
  return txHash as string;
}

/** Read the verdict the judge stored, retrying while it settles to accepted state. */
export async function readVerdict(judgeAddress: string, claimId: string, keyId?: string): Promise<Verdict> {
  const client = makeClient(keyId);
  const raw = await pollRead(client, {
    address: judgeAddress as `0x${string}`,
    functionName: "get_verdict",
    args: [claimId],
  });
  return JSON.parse(raw as string) as Verdict;
}

/** Read a judge's stored verdict if present, without long-polling. Returns null
 * when the judge hasn't ruled on this claim yet (used by the registry detail view). */
export async function readVerdictMaybe(
  judgeAddress: string,
  claimId: string,
  keyId?: string,
): Promise<Verdict | null> {
  const client = makeClient(keyId);
  try {
    const raw = await rpcRead(client, {
      address: judgeAddress as `0x${string}`,
      functionName: "get_verdict",
      args: [claimId],
    });
    return raw ? (JSON.parse(raw as string) as Verdict) : null;
  } catch {
    // "no verdict for claim" (not ruled yet) or a read blip: treat as unavailable
    return null;
  }
}

/** Make the judge fetch a live USD market price under consensus, returning micro-USD. */
export async function readPrice(
  judgeAddress: string,
  claimId: string,
  coingeckoId: string,
  keyId?: string,
): Promise<bigint> {
  const client = makeClient(keyId);
  const txHash = await rpcWrite(client, {
    address: judgeAddress as `0x${string}`,
    functionName: "read_price",
    args: [claimId, coingeckoId],
    value: 0n,
  });
  await rpcWait(client, { hash: txHash, ...ACCEPTED });
  const raw = await pollRead(client, {
    address: judgeAddress as `0x${string}`,
    functionName: "get_price",
    args: [claimId],
  });
  return BigInt(raw as string);
}

/** Make the judge look the custodian up in a public knowledge source under consensus. */
export async function readCustodian(
  judgeAddress: string,
  claimId: string,
  entityName: string,
  keyId?: string,
): Promise<string> {
  const client = makeClient(keyId);
  const txHash = await rpcWrite(client, {
    address: judgeAddress as `0x${string}`,
    functionName: "read_custodian",
    args: [claimId, entityName],
    value: 0n,
  });
  await rpcWait(client, { hash: txHash, ...ACCEPTED });
  return (await pollRead(client, {
    address: judgeAddress as `0x${string}`,
    functionName: "get_custodian",
    args: [claimId],
  })) as string;
}

/** Make the judge fetch the attestation document and verify its SHA-256 under consensus. */
export async function readAttestation(
  judgeAddress: string,
  claimId: string,
  url: string,
  expectedSha256: string,
  keyId?: string,
): Promise<string> {
  const client = makeClient(keyId);
  const txHash = await rpcWrite(client, {
    address: judgeAddress as `0x${string}`,
    functionName: "read_attestation",
    args: [claimId, url, expectedSha256],
    value: 0n,
  });
  await rpcWait(client, { hash: txHash, ...ACCEPTED });
  return (await pollRead(client, {
    address: judgeAddress as `0x${string}`,
    functionName: "get_attestation",
    args: [claimId],
  })) as string;
}

/** Cross-chain read: make the judge fetch a Casper reserve balance under consensus. */
export async function readReserve(
  judgeAddress: string,
  claimId: string,
  casperNodeUrl: string,
  reservePublicKey: string,
  keyId?: string,
): Promise<bigint> {
  const client = makeClient(keyId);
  const txHash = await rpcWrite(client, {
    address: judgeAddress as `0x${string}`,
    functionName: "read_reserve",
    args: [claimId, casperNodeUrl, reservePublicKey],
    value: 0n,
  });
  await rpcWait(client, { hash: txHash, ...ACCEPTED });
  const raw = await pollRead(client, {
    address: judgeAddress as `0x${string}`,
    functionName: "get_reserve",
    args: [claimId],
  });
  return BigInt(raw as string);
}

export interface ScoutDiscovery {
  key: string;
  asset: string;
  evidence: string; // the framed claim JSON the panel will judge
  source: string;
}

/** Make the Scout contract scrape one live RWA source under consensus, storing any
 * newly discovered backing claims. A write, signed by the deployer account. */
export async function scoutScan(
  scoutAddress: string,
  sourceUrl: string,
  sourceKind: string,
  maxItems: number,
  keyId?: string,
): Promise<string> {
  const client = makeClient(keyId);
  const txHash = await rpcWrite(client, {
    address: scoutAddress as `0x${string}`,
    functionName: "scan",
    args: [sourceUrl, sourceKind, maxItems],
    value: 0n,
  });
  await rpcWait(client, { hash: txHash, ...ACCEPTED });
  return txHash as string;
}

/** Read everything the Scout has discovered so far. */
export async function scoutListDiscoveries(scoutAddress: string, keyId?: string): Promise<ScoutDiscovery[]> {
  const client = makeClient(keyId);
  const raw = await rpcRead(client, {
    address: scoutAddress as `0x${string}`,
    functionName: "list_discoveries",
    args: [],
  });
  return JSON.parse((raw as string) || "[]") as ScoutDiscovery[];
}

/** Read one discovery's stored record (used by the /scout/evidence route). */
export async function scoutGetDiscovery(scoutAddress: string, key: string, keyId?: string): Promise<ScoutDiscovery | null> {
  const client = makeClient(keyId);
  try {
    const raw = await rpcRead(client, {
      address: scoutAddress as `0x${string}`,
      functionName: "get_discovery",
      args: [key],
    });
    if (!raw) return null;
    const rec = JSON.parse(raw as string);
    return { key, asset: rec.asset, evidence: rec.evidence, source: rec.source };
  } catch {
    return null;
  }
}
