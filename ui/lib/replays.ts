import type { StreamEvent, Vote, ClaimStatus } from "./types";
import type { FacetKey } from "./facets";

// Real runs that already happened on Casper Testnet (see DEPLOYMENTS.md). These are
// played back at a watchable speed so the whole story is visible in ~10 seconds.
// The votes, confidences, fetched values, and the finalize tx are all real; the
// finalize tx links to cspr.live so anyone can verify it. This is a replay of real
// data, not a simulation.

interface ReplayFacet {
  facet: FacetKey;
  detail?: string; // what it fetched under consensus
  vote: Vote;
  confidence: number; // bps
  reason: string;
}

export interface Replay {
  key: string;
  claimId: number;
  label: string;
  facets: ReplayFacet[];
  status: ClaimStatus;
  finalizeTx: string;
}

export const REPLAYS: Replay[] = [
  {
    key: "replay:8",
    claimId: 8,
    label: "Replay: claim 8 — NotBacked (the veto)",
    status: "NotBacked",
    finalizeTx: "60d6603832ac50e2dc6eb74d3858ae04db5fb7976a317faa0554b047425f43e8",
    facets: [
      { facet: "authenticity", vote: "UNCERTAIN", confidence: 9000, reason: "the attestation couldn't be verified from the evidence." },
      { facet: "solvency", detail: "reserve read live: 2653 CSPR", vote: "FAIL", confidence: 10000, reason: "the on-chain reserve falls far short of the stated liabilities." },
      { facet: "custodian", vote: "UNCERTAIN", confidence: 9500, reason: "the named custodian couldn't be confirmed." },
      { facet: "valuation", detail: "market price read: $0.002377", vote: "FAIL", confidence: 8500, reason: "the claimed value isn't supported by the market price." },
    ],
  },
  {
    key: "replay:5",
    claimId: 5,
    label: "Replay: claim 5 — Backed (reserve covers it)",
    status: "Backed",
    finalizeTx: "b8b499be977e1ec2b60dfad1b2fcc23e3862f0aa32058f45d1bfa34b09769fb3",
    facets: [
      { facet: "authenticity", vote: "UNCERTAIN", confidence: 9500, reason: "plain-text attestation with no signature to verify." },
      { facet: "solvency", detail: "reserve read live: 2671 CSPR", vote: "PASS", confidence: 9000, reason: "2671 CSPR on-chain covers the 2000 CSPR liability, same asset." },
      { facet: "custodian", vote: "PASS", confidence: 8500, reason: "the named custodian resolved to a real public record." },
      { facet: "valuation", detail: "market price read", vote: "PASS", confidence: 9500, reason: "the stated value holds up against the live market price." },
    ],
  },
  {
    key: "replay:10",
    claimId: 10,
    label: "Replay: claim 10 — Disputed (real money, bad paperwork)",
    status: "Disputed",
    finalizeTx: "b816d000bb36c3a520270e314f44905d682aed8add1820ae81e7eeddd7f75f3d",
    facets: [
      { facet: "authenticity", detail: "SHA-256 matches", vote: "FAIL", confidence: 9800, reason: "hash-valid, but the file is a software license, not an attestation." },
      { facet: "solvency", detail: "reserve read live: 2640 CSPR", vote: "PASS", confidence: 10000, reason: "2640 CSPR on-chain covers the 2000 CSPR liability." },
      { facet: "custodian", detail: 'resolved "BitGo"', vote: "PASS", confidence: 10000, reason: '"BitGo" resolved in a public knowledge source.' },
      { facet: "valuation", detail: "market price read: $0.002306", vote: "PASS", confidence: 9500, reason: "the live price supports the claimed value." },
    ],
  },
];

export const replayByKey = (key: string): Replay | undefined => REPLAYS.find((r) => r.key === key);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Emit the same StreamEvents a live run does, paced so it's watchable.
export async function playReplay(replay: Replay, onEvent: (e: StreamEvent) => void): Promise<void> {
  onEvent({ type: "claim-opened", claimId: replay.claimId, tx: "" });
  await sleep(700);

  for (const f of replay.facets) {
    onEvent({ type: "facet-started", facet: f.facet });
    await sleep(500);
    if (f.detail) {
      onEvent({ type: "facet-fetched", facet: f.facet, detail: f.detail });
      await sleep(650);
    }
    onEvent({ type: "facet-verdict", facet: f.facet, vote: f.vote, confidence: f.confidence, reason: f.reason, genlayerTx: "" });
    await sleep(450);
    onEvent({ type: "facet-submitted", facet: f.facet, submitTx: "" });
    await sleep(350);
  }

  onEvent({ type: "finalized", status: replay.status, finalizeTx: replay.finalizeTx });
  await sleep(300);
  onEvent({ type: "done" });
}
