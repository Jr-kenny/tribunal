import type { FacetKey } from "./facets";

// Events streamed from /api/claim/run to the dashboard. Mirrors the orchestrator's
// PanelEvent plus the claim-level beats, kept here so the client bundle never has
// to import the heavy server SDK just for a type.
export type StreamEvent =
  | { type: "claim-opened"; claimId: number; tx: string }
  | { type: "facet-started"; facet: FacetKey }
  | { type: "facet-fetched"; facet: FacetKey; detail: string }
  | { type: "facet-verdict"; facet: FacetKey; vote: Vote; confidence: number; reason: string; genlayerTx: string }
  | { type: "facet-submitted"; facet: FacetKey; submitTx: string }
  | { type: "facet-error"; facet: FacetKey; message: string }
  | { type: "finalized"; status?: ClaimStatus; finalizeTx: string }
  | { type: "done" }
  | { type: "error"; message: string };

export type Vote = "PASS" | "FAIL" | "UNCERTAIN";
export type ClaimStatus = "Open" | "Backed" | "Disputed" | "NotBacked";

// Per-judge view state the dashboard renders.
export type JudgeStatus = "idle" | "fetching" | "judging" | "verdict" | "submitted" | "error";

export interface JudgeView {
  status: JudgeStatus;
  detail?: string;
  vote?: Vote;
  confidence?: number;
  reason?: string;
  genlayerTx?: string;
  submitTx?: string;
  error?: string;
}

export interface ReputationRow {
  key: FacetKey;
  bps: number | null;
}
