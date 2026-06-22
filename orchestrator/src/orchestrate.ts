// The relay: run the GenLayer facet judges on a claim's evidence, submit each
// verdict to Casper carrying its GenLayer tx hash as proof, then finalize once so
// the contract federates them (critical-facet veto + reputation-weighted score).
//
// This is the "notary": it makes no judgment of its own, it only commits what the
// judges provably attested. GenLayer is the trust-minimized judge; Casper is the
// registry, federation, and economic settlement layer.

import { runJudge, runJudgeWithRubric, readVerdict, readReserve, readPrice, readCustodian, readAttestation } from "./genlayer.js";
import { submitVerdict, finalize } from "./casper.js";
import { confirm } from "./chainread.js";
import { config } from "./config.js";

export interface FacetSpec {
  key: string;
  facetId: number;
  critical: boolean;
  judge: string;
  // this facet's own Casper key, so its verdict accrues reputation per judge
  casperKey: string;
  // this facet's own GenLayer account, so the four judges can run concurrently
  // instead of sharing one account's nonce
  genlayerKey: string;
  // each facet that verifies external/on-chain truth fetches it under consensus first:
  readsReserve?: boolean; // solvency: reserve balance off Casper
  readsPrice?: boolean; // valuation: live market price
  readsCustodian?: boolean; // custodian: public knowledge-source lookup
  readsAttestation?: boolean; // authenticity: document SHA-256 integrity check
}

// facet ids match the Tribunal contract's configured ids (see judges/rubrics.py)
const JUDGE_KEY = (facet: string) => `../.keys/casper/judges/${facet}.pem`;
const GL_KEY = (facet: string) => `../.keys/genlayer/judges/${facet}.key`;
export const FACETS: FacetSpec[] = [
  { key: "authenticity", facetId: 1, critical: false, judge: config.genlayerAuthenticityJudge, casperKey: JUDGE_KEY("authenticity"), genlayerKey: GL_KEY("authenticity"), readsAttestation: true },
  { key: "solvency", facetId: 2, critical: true, judge: config.genlayerSolvencyJudge, casperKey: JUDGE_KEY("solvency"), genlayerKey: GL_KEY("solvency"), readsReserve: true },
  { key: "custodian", facetId: 3, critical: false, judge: config.genlayerCustodianJudge, casperKey: JUDGE_KEY("custodian"), genlayerKey: GL_KEY("custodian"), readsCustodian: true },
  { key: "valuation", facetId: 4, critical: false, judge: config.genlayerValuationJudge, casperKey: JUDGE_KEY("valuation"), genlayerKey: GL_KEY("valuation"), readsPrice: true },
];

// The four checks as general verification dimensions, used for any claim that
// isn't proof-of-reserves. Each maps onto one of the existing judges, so the panel
// stays four distinct specialists; only the question is written per claim. This is
// the "receptionist" writing each judge's question for an arbitrary claim.
const GENERAL_QUESTIONS: Record<string, { facetName: string; rubric: string }> = {
  authenticity: {
    facetName: "Provenance",
    rubric:
      "Is the documentation or source behind this claim genuine, internally consistent, and credible? PASS if the evidence looks authentic and well-formed; FAIL if it shows signs of fabrication, tampering, or contradiction; UNCERTAIN if it cannot be assessed from the evidence.",
  },
  solvency: {
    facetName: "Core truth",
    rubric:
      "Is the central factual claim actually true given the evidence? This is the heart of the claim. PASS only if the evidence substantiates it; FAIL if the evidence contradicts or fails to support it; UNCERTAIN if it cannot be determined.",
  },
  custodian: {
    facetName: "Counterparty",
    rubric:
      "Are the people, companies, or entities named in this claim real and legitimate? PASS if they are recognizable and clean; FAIL if they appear fabricated, flagged, or sanctioned; UNCERTAIN if they cannot be evaluated.",
  },
  valuation: {
    facetName: "Consistency",
    rubric:
      "Do the figures, amounts, and values in this claim hold up and make internal and market sense? PASS if consistent and plausible; FAIL if materially inflated, contradictory, or unsupported; UNCERTAIN if there is nothing to check against.",
  },
};

/** A treasury / proof-of-reserves claim is one that names a reserve wallet; those
 * get the specialist on-chain reads. Anything else is judged generically. */
function isTreasuryClaim(evidence: string): boolean {
  try {
    return Boolean(JSON.parse(evidence).reserve_wallet);
  } catch {
    return false;
  }
}

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

/** Structured progress events, so a UI can stream a run instead of waiting minutes. */
export type PanelEvent =
  | { type: "facet-started"; facet: string }
  | { type: "facet-fetched"; facet: string; detail: string }
  | { type: "facet-verdict"; facet: string; vote: string; confidence: number; reason: string; genlayerTx: string }
  | { type: "facet-submitted"; facet: string; submitTx: string }
  | { type: "facet-error"; facet: string; message: string }
  | { type: "finalized"; status?: string; finalizeTx: string };

export type OnEvent = (e: PanelEvent) => void;
const noop: OnEvent = () => {};

/** Run one facet's GenLayer judgement under consensus and submit it to Casper. */
export async function judgeFacet(
  spec: FacetSpec,
  claimId: number,
  evidence: string,
  onEvent: OnEvent = noop,
): Promise<FacetResult> {
  if (!spec.judge) throw new Error(`No judge address configured for facet "${spec.key}"`);
  onEvent({ type: "facet-started", facet: spec.key });

  // Facets that verify on-chain truth fetch it first, under consensus, so the
  // verdict is decided against the chain rather than the issuer's paperwork.
  if (spec.readsReserve) {
    const wallet = JSON.parse(evidence).reserve_wallet as string | undefined;
    if (wallet) {
      console.log(`[${spec.key}] reading reserve wallet ${wallet} live from Casper...`);
      const motes = await readReserve(spec.judge, String(claimId), config.casperPublicNodeUrl, wallet, spec.genlayerKey);
      console.log(`[${spec.key}] verified on-chain reserve: ${motes} motes (${motes / 1_000_000_000n} CSPR)`);
      onEvent({ type: "facet-fetched", facet: spec.key, detail: `reserve read live: ${motes / 1_000_000_000n} CSPR` });
    }
  }

  if (spec.readsPrice) {
    // coingecko id for the priced asset; defaults to CSPR for these claims
    const symbol = (JSON.parse(evidence).price_symbol as string | undefined) ?? "casper-network";
    console.log(`[${spec.key}] reading live market price for "${symbol}" under consensus...`);
    const micro = await readPrice(spec.judge, String(claimId), symbol, spec.genlayerKey);
    console.log(`[${spec.key}] verified market price: $${(Number(micro) / 1_000_000).toFixed(6)} per unit`);
    onEvent({ type: "facet-fetched", facet: spec.key, detail: `market price read: $${(Number(micro) / 1_000_000).toFixed(6)}` });
  }

  if (spec.readsCustodian) {
    const name = JSON.parse(evidence).custodian as string | undefined;
    if (name) {
      console.log(`[${spec.key}] looking up custodian "${name}" under consensus...`);
      const record = JSON.parse(await readCustodian(spec.judge, String(claimId), name, spec.genlayerKey));
      console.log(`[${spec.key}] custodian record: ${record.found ? `found "${record.title}"` : "NO public record"}`);
      onEvent({ type: "facet-fetched", facet: spec.key, detail: record.found ? `resolved "${record.title}"` : "no public record found" });
    }
  }

  if (spec.readsAttestation) {
    const ev = JSON.parse(evidence);
    if (ev.document_url && ev.document_sha256) {
      console.log(`[${spec.key}] fetching + hashing attestation document under consensus...`);
      const result = JSON.parse(await readAttestation(spec.judge, String(claimId), ev.document_url, ev.document_sha256, spec.genlayerKey));
      console.log(`[${spec.key}] document integrity: ${result.match ? "SHA-256 matches" : "SHA-256 MISMATCH"}`);
      onEvent({ type: "facet-fetched", facet: spec.key, detail: result.match ? "SHA-256 matches" : "SHA-256 mismatch" });
    }
  }

  console.log(`[${spec.key}] running GenLayer judge on claim ${claimId}...`);
  const genlayerTx = await runJudge(spec.judge, String(claimId), evidence, spec.genlayerKey);
  const verdict = await readVerdict(spec.judge, String(claimId), spec.genlayerKey);
  console.log(`[${spec.key}] ${verdict.vote} @ ${verdict.confidence}bps - ${verdict.reason}`);
  onEvent({ type: "facet-verdict", facet: spec.key, vote: verdict.vote, confidence: verdict.confidence, reason: verdict.reason, genlayerTx });

  const submitTx = await submitVerdict(claimId, spec.facetId, verdict.vote, verdict.confidence, genlayerTx, spec.casperKey);
  console.log(`[${spec.key}] submitted to Casper (own key), tx ${submitTx}`);
  onEvent({ type: "facet-submitted", facet: spec.key, submitTx });

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

/** Run one facet generically: a per-claim question (no specialist on-chain reads),
 * for claim types beyond proof-of-reserves. */
export async function judgeFacetGeneric(
  spec: FacetSpec,
  claimId: number,
  evidence: string,
  onEvent: OnEvent = noop,
): Promise<FacetResult> {
  if (!spec.judge) throw new Error(`No judge address configured for facet "${spec.key}"`);
  onEvent({ type: "facet-started", facet: spec.key });
  const q = GENERAL_QUESTIONS[spec.key];
  console.log(`[${spec.key}] judging "${q.facetName}" (generic) on claim ${claimId}...`);
  const genlayerTx = await runJudgeWithRubric(spec.judge, String(claimId), evidence, q.facetName, q.rubric, spec.genlayerKey);
  const verdict = await readVerdict(spec.judge, String(claimId), spec.genlayerKey);
  console.log(`[${spec.key}] ${verdict.vote} @ ${verdict.confidence}bps - ${verdict.reason}`);
  onEvent({ type: "facet-verdict", facet: spec.key, vote: verdict.vote, confidence: verdict.confidence, reason: verdict.reason, genlayerTx });
  const submitTx = await submitVerdict(claimId, spec.facetId, verdict.vote, verdict.confidence, genlayerTx, spec.casperKey);
  onEvent({ type: "facet-submitted", facet: spec.key, submitTx });
  return { facet: spec.key, facetId: spec.facetId, genlayerTx, vote: verdict.vote, confidence: verdict.confidence, reason: verdict.reason, submitTx };
}

/** Run every configured facet judge on a claim, then finalize once on Casper.
 * Treasury claims get the specialist on-chain reads + their fixed rubrics; any
 * other claim is judged generically against the four general questions. */
export async function relayPanel(claimId: number, evidence: string, onEvent: OnEvent = noop): Promise<PanelResult> {
  const configured = FACETS.filter((f) => f.judge);
  if (configured.length === 0) throw new Error("No facet judges configured (set the GENLAYER_*_JUDGE env vars)");

  const generic = !isTreasuryClaim(evidence);
  console.log(`[panel] claim ${claimId}: ${generic ? "generic (beyond treasury)" : "proof-of-reserves"} path`);
  const runOne = generic
    ? (spec: FacetSpec) => judgeFacetGeneric(spec, claimId, evidence, onEvent)
    : (spec: FacetSpec) => judgeFacet(spec, claimId, evidence, onEvent);

  // Run all judges at once. Each has its own GenLayer account and its own Casper
  // key, so there's no shared nonce to serialize on; allSettled means one judge
  // failing doesn't sink the others.
  const settled = await Promise.allSettled(configured.map(runOne));
  const facets: FacetResult[] = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") {
      facets.push(r.value);
    } else {
      const spec = configured[i];
      const message = (r.reason as Error)?.message ?? String(r.reason);
      console.log(`[${spec.key}] failed: ${message}`);
      onEvent({ type: "facet-error", facet: spec.key, message });
    }
  });

  // The submits now fire concurrently, so wait until each verdict is actually
  // on-chain before finalizing, otherwise finalize could race ahead of them.
  await Promise.all(facets.map((f) => confirm(f.submitTx).catch(() => {})));

  const finalizeTx = await finalize(claimId);
  console.log(`[panel] finalized on Casper, tx ${finalizeTx}`);
  onEvent({ type: "finalized", finalizeTx });
  return { facets, finalizeTx };
}

/** Relay a single named facet end to end (judge -> submit -> finalize). */
export async function relayFacet(facetKey: string, claimId: number, evidence: string): Promise<PanelResult> {
  const spec = FACETS.find((f) => f.key === facetKey);
  if (!spec) throw new Error(`Unknown facet "${facetKey}" (expected one of ${FACETS.map((f) => f.key).join(", ")})`);
  const result = await judgeFacet(spec, claimId, evidence);
  await confirm(result.submitTx).catch(() => {});
  const finalizeTx = await finalize(claimId);
  console.log(`[${facetKey}] finalized on Casper, tx ${finalizeTx}`);
  return { facets: [result], finalizeTx };
}
