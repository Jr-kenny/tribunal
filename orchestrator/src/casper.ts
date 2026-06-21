// Casper half of the relay (the notary): submit a judge's verdict and finalize
// a claim on the Tribunal contract, signing natively with casper-js-sdk v5.
//
// The Vote enum encodes on the wire as a single U8 discriminant
// (Pass=0, Fail=1, Uncertain=2), confirmed from the cargo-odra contract schema.

import { readFileSync } from "node:fs";
// casper-js-sdk is CJS, so default-import the values and type-import the types
// (named runtime imports fail under ESM).
import C from "casper-js-sdk";
import type { PrivateKey, RpcClient, Args } from "casper-js-sdk";
import { config } from "./config.js";
import type { Vote } from "./genlayer.js";

const VOTE_DISCRIMINANT: Record<Vote, number> = { PASS: 0, FAIL: 1, UNCERTAIN: 2 };

// generous per-call gas, well under the block gas limit (installs ran ~hundreds of CSPR)
const CALL_PAYMENT = 6_000_000_000;

function loadKey(): PrivateKey {
  if (!config.casperSecretKeyPath) throw new Error("Missing CASPER_SECRET_KEY path");
  const pem = readFileSync(config.casperSecretKeyPath, "utf8");
  return C.PrivateKey.fromPem(pem, C.KeyAlgorithm.ED25519);
}

function rpc(): RpcClient {
  return new C.RpcClient(new C.HttpHandler(config.casperNodeUrl));
}

function packageHashHex(): string {
  if (!config.tribunalContractHash) throw new Error("Missing TRIBUNAL_CONTRACT_HASH");
  return config.tribunalContractHash.replace(/^hash-/, "");
}

async function call(entryPoint: string, args: Args): Promise<string> {
  const key = loadKey();
  const tx = new C.ContractCallBuilder()
    .byPackageHash(packageHashHex())
    .entryPoint(entryPoint)
    .runtimeArgs(args)
    .from(key.publicKey)
    .chainName(config.casperNetwork)
    .payment(CALL_PAYMENT)
    .build();
  tx.sign(key);
  const res = await rpc().putTransaction(tx);
  return res.transactionHash.toHex?.() ?? String(res.transactionHash);
}

/** Open a new claim, returning the submit tx hash (claim id is read from contract state). */
export async function openClaim(): Promise<string> {
  return call("open_claim", C.Args.fromMap({}));
}

/** Submit a facet verdict carrying the GenLayer tx hash as proof. */
export async function submitVerdict(
  claimId: number,
  facetId: number,
  vote: Vote,
  confidenceBps: number,
  genlayerProof: string,
): Promise<string> {
  const args = C.Args.fromMap({
    claim_id: C.CLValue.newCLUint64(claimId),
    facet_id: C.CLValue.newCLUint8(facetId),
    vote: C.CLValue.newCLUint8(VOTE_DISCRIMINANT[vote]),
    confidence: C.CLValue.newCLUInt32(confidenceBps),
    genlayer_proof: C.CLValue.newCLString(genlayerProof),
  });
  return call("submit_verdict", args);
}

/** Federate the submitted verdicts into the on-chain outcome. */
export async function finalize(claimId: number): Promise<string> {
  return call("finalize", C.Args.fromMap({ claim_id: C.CLValue.newCLUint64(claimId) }));
}
