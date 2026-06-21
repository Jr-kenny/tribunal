// The relay: run the GenLayer facet judges on a claim's evidence, submit each
// verdict to Casper carrying its GenLayer tx hash as proof, then finalize once so
// the contract federates them (critical-facet veto + reputation-weighted score).
//
// This is the "notary": it makes no judgment of its own, it only commits what the
// judges provably attested. GenLayer is the trust-minimized judge; Casper is the
// registry, federation, and economic settlement layer.

import { runJudge, readVerdict, readReserve } from "./genlayer.js";
import { submitVerdict, finalize } from "./casper.js";
import { config } from "./config.js";

export interface FacetSpec {
  key: string;
  facetId: number;
  critical: boolean;
  judge: string;
  // solvency reads the reserve balance live off Casper before judging
  readsReserve?: boolean;
}

// facet ids match the Tribunal contract's configured ids (see judges/rubrics.py)
export const FACETS: FacetSpec[] = [
  { key: "authenticity", facetId: 1, critical: false, judge: config.genlayerAuthenticityJudge },
  { key: "solvency", facetId: 2, critical: true, judge: config.genlayerSolvencyJudge, readsReserve: true },
  { key: "custodian", facetId: 3, critical: false, judge: config.genlayerCustodianJudge },
  { key: "valuation", facetId: 4, critical: false, judge: config.genlayerValuationJudge },
];

export interface FacetResult {
  facet: string;
  facetId: number;
  genlayerTx: string;
  vote: string;
  confidence: number;
  reason: string;
  submitTx: string;
}

export interface PanelResult {
  facets: FacetResult[];
  finalizeTx: string;
}

/** Run one facet's GenLayer judgement under consensus and submit it to Casper. */
export async function judgeFacet(spec: FacetSpec, claimId: number, evidence: string): Promise<FacetResult> {
  if (!spec.judge) throw new Error(`No judge address configured for facet "${spec.key}"`);

  // Facets that verify on-chain truth fetch it first, under consensus, so the
  // verdict is decided against the chain rather than the issuer's paperwork.
  if (spec.readsReserve) {
    const wallet = JSON.parse(evidence).reserve_wallet as string | undefined;
    if (wallet) {
      console.log(`[${spec.key}] reading reserve wallet ${wallet} live from Casper...`);
      const motes = await readReserve(spec.judge, String(claimId), config.casperPublicNodeUrl, wallet);
      console.log(`[${spec.key}] verified on-chain reserve: ${motes} motes (${motes / 1_000_000_000n} CSPR)`);
    }
  }

  console.log(`[${spec.key}] running GenLayer judge on claim ${claimId}...`);
  const genlayerTx = await runJudge(spec.judge, String(claimId), evidence);
  const verdict = await readVerdict(spec.judge, String(claimId));
  console.log(`[${spec.key}] ${verdict.vote} @ ${verdict.confidence}bps - ${verdict.reason}`);

  const submitTx = await submitVerdict(claimId, spec.facetId, verdict.vote, verdict.confidence, genlayerTx);
  console.log(`[${spec.key}] submitted to Casper, tx ${submitTx}`);

  return {
    facet: spec.key,
    facetId: spec.facetId,
    genlayerTx,
    vote: verdict.vote,
    confidence: verdict.confidence,
    reason: verdict.reason,
    submitTx,
  };
}

/** Run every configured facet judge on a claim, then finalize once on Casper. */
export async function relayPanel(claimId: number, evidence: string): Promise<PanelResult> {
  const configured = FACETS.filter((f) => f.judge);
  if (configured.length === 0) throw new Error("No facet judges configured (set the GENLAYER_*_JUDGE env vars)");

  // Sequential so the single Casper signing key submits one tx at a time.
  const facets: FacetResult[] = [];
  for (const spec of configured) {
    facets.push(await judgeFacet(spec, claimId, evidence));
  }

  const finalizeTx = await finalize(claimId);
  console.log(`[panel] finalized on Casper, tx ${finalizeTx}`);
  return { facets, finalizeTx };
}

/** Relay a single named facet end to end (judge -> submit -> finalize). */
export async function relayFacet(facetKey: string, claimId: number, evidence: string): Promise<PanelResult> {
  const spec = FACETS.find((f) => f.key === facetKey);
  if (!spec) throw new Error(`Unknown facet "${facetKey}" (expected one of ${FACETS.map((f) => f.key).join(", ")})`);
  const result = await judgeFacet(spec, claimId, evidence);
  const finalizeTx = await finalize(claimId);
  console.log(`[${facetKey}] finalized on Casper, tx ${finalizeTx}`);
  return { facets: [result], finalizeTx };
}
