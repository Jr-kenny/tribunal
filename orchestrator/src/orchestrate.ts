// The relay: run a GenLayer facet judge on a claim's evidence, then commit its
// verdict to Casper carrying the GenLayer tx hash as proof, and finalize.
//
// This is the "notary": it makes no judgment of its own, it only commits what
// GenLayer provably attested. GenLayer is the trust-minimized judge; Casper is
// the registry, federation, and economic settlement layer.

import { runJudge, readVerdict } from "./genlayer.js";
import { submitVerdict, finalize } from "./casper.js";
import { config } from "./config.js";

const SOLVENCY_FACET = 2;

export interface RelayResult {
  genlayerTx: string;
  vote: string;
  confidence: number;
  reason: string;
  submitTx: string;
  finalizeTx: string;
}

/**
 * Relay one facet judgement end to end for an already-opened claim.
 * @param claimId  the on-chain Casper claim id (opened separately)
 * @param evidence the claim evidence handed to the GenLayer judge
 */
export async function relaySolvency(claimId: number, evidence: string): Promise<RelayResult> {
  const judge = config.genlayerSolvencyJudge;
  if (!judge) throw new Error("Missing GENLAYER_SOLVENCY_JUDGE address");

  // 1. GenLayer renders the verdict under consensus; we keep its tx hash as proof.
  console.log(`[relay] running GenLayer solvency judge on claim ${claimId}...`);
  const genlayerTx = await runJudge(judge, String(claimId), evidence);
  console.log(`[relay] GenLayer verdict accepted, tx ${genlayerTx}`);

  const verdict = await readVerdict(judge, String(claimId));
  console.log(`[relay] verdict: ${verdict.vote} @ ${verdict.confidence}bps - ${verdict.reason}`);

  // 2. Commit the verdict to Casper, carrying the GenLayer tx hash as proof.
  const submitTx = await submitVerdict(
    claimId,
    SOLVENCY_FACET,
    verdict.vote,
    verdict.confidence,
    genlayerTx,
  );
  console.log(`[relay] submitted to Casper, tx ${submitTx}`);

  // 3. Federate on Casper.
  const finalizeTx = await finalize(claimId);
  console.log(`[relay] finalized on Casper, tx ${finalizeTx}`);

  return {
    genlayerTx,
    vote: verdict.vote,
    confidence: verdict.confidence,
    reason: verdict.reason,
    submitTx,
    finalizeTx,
  };
}
