"use client";

import { useState } from "react";
import { ClaimForm, CUSTOM_TEMPLATE } from "@/components/ClaimForm";
import { JudgePanel } from "@/components/JudgePanel";
import { VerdictCard } from "@/components/VerdictCard";
import { ReputationBoard } from "@/components/ReputationBoard";
import { TxLink } from "@/components/TxLink";
import { runClaim } from "@/lib/sse";
import type { ClaimStatus, JudgeView, StreamEvent } from "@/lib/types";

const FRESH: Record<string, JudgeView> = {
  authenticity: { status: "idle" },
  solvency: { status: "idle" },
  custodian: { status: "idle" },
  valuation: { status: "idle" },
};

function whyLine(status: ClaimStatus, views: Record<string, JudgeView>): string {
  if (status === "NotBacked" && views.solvency?.vote === "FAIL")
    return "The critical solvency facet failed, so the veto sank the whole claim.";
  if (status === "Backed") return "No facet vetoed and the reputation-weighted score cleared the backed band.";
  if (status === "Disputed") return "The score landed between the bands: a real soft spot somewhere in the panel.";
  if (status === "NotBacked") return "The reputation-weighted score fell into the not-backed band.";
  return "";
}

export default function DashboardPage() {
  const [claimKey, setClaimKey] = useState("claim-lying");
  const [evidence, setEvidence] = useState(CUSTOM_TEMPLATE);
  const [running, setRunning] = useState(false);
  const [views, setViews] = useState<Record<string, JudgeView>>(FRESH);
  const [claimId, setClaimId] = useState<number | null>(null);
  const [openTx, setOpenTx] = useState<string | null>(null);
  const [status, setStatus] = useState<ClaimStatus | null>(null);
  const [finalizeTx, setFinalizeTx] = useState<string | undefined>();
  const [repKey, setRepKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const patch = (facet: string, p: Partial<JudgeView>) =>
    setViews((v) => ({ ...v, [facet]: { ...v[facet], ...p } }));

  async function onRun() {
    // a custom claim ships raw evidence; validate it's JSON before opening anything on-chain
    let body: { claimKey?: string; evidence?: string };
    if (claimKey === "custom") {
      try {
        JSON.parse(evidence);
      } catch {
        setError("Custom claim isn't valid JSON. Fix it and run again.");
        return;
      }
      body = { evidence };
    } else {
      body = { claimKey };
    }

    setRunning(true);
    setViews(FRESH);
    setStatus(null);
    setFinalizeTx(undefined);
    setClaimId(null);
    setOpenTx(null);
    setError(null);

    await runClaim(body, (e: StreamEvent) => {
      switch (e.type) {
        case "claim-opened":
          setClaimId(e.claimId);
          setOpenTx(e.tx);
          break;
        case "facet-started":
          patch(e.facet, { status: "fetching", detail: "fetching evidence…" });
          break;
        case "facet-fetched":
          patch(e.facet, { status: "fetching", detail: e.detail });
          break;
        case "facet-verdict":
          patch(e.facet, {
            status: "verdict",
            vote: e.vote,
            confidence: e.confidence,
            reason: e.reason,
            genlayerTx: e.genlayerTx,
          });
          break;
        case "facet-submitted":
          patch(e.facet, { status: "submitted", submitTx: e.submitTx });
          break;
        case "facet-error":
          patch(e.facet, { status: "error", error: e.message });
          break;
        case "finalized":
          if (e.status) setStatus(e.status);
          setFinalizeTx(e.finalizeTx);
          setRepKey((k) => k + 1);
          break;
        case "done":
          setRunning(false);
          setRepKey((k) => k + 1);
          break;
        case "error":
          setError(e.message);
          setRunning(false);
          break;
      }
    });
    setRunning(false);
  }

  return (
    <main className="container" style={{ paddingTop: 40, paddingBottom: 20 }}>
      <p style={{ textTransform: "uppercase", letterSpacing: "0.14em", fontSize: 12, color: "var(--accent)", marginBottom: 10, fontWeight: 500 }}>
        Dashboard
      </p>
      <h1 style={{ fontSize: 30, marginBottom: 8 }}>Run the panel.</h1>
      <p className="dim" style={{ fontSize: 16, marginBottom: 24, maxWidth: 620 }}>
        Pick a claim and run it live against the Casper Testnet contract and the four GenLayer judges.
        Each judge fetches its own truth, submits its verdict, and the contract federates them.
      </p>

      <ClaimForm
        claimKey={claimKey}
        onClaimKey={setClaimKey}
        evidence={evidence}
        onEvidence={setEvidence}
        onRun={onRun}
        running={running}
      />

      {(claimId != null || openTx) && (
        <p className="dim" style={{ fontSize: 13, margin: "12px 2px 0" }}>
          {claimId != null ? `Claim ${claimId} opened on Casper` : "Opening claim…"}{" "}
          {openTx && <TxLink hash={openTx} kind="casper" />}
        </p>
      )}

      {error && (
        <div className="card" style={{ padding: 16, marginTop: 16, borderColor: "var(--fail)" }}>
          <span style={{ color: "var(--fail)", fontSize: 14 }}>Run error: {error}</span>
        </div>
      )}

      <div style={{ marginTop: 22 }}>
        <JudgePanel views={views} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, marginTop: 16 }}>
        {status ? (
          <VerdictCard status={status} finalizeTx={finalizeTx} why={whyLine(status, views)} />
        ) : (
          <div className="card" style={{ padding: "22px 24px", display: "flex", alignItems: "center" }}>
            <span className="faint" style={{ fontSize: 14 }}>The federated verdict will appear here once the panel finalizes.</span>
          </div>
        )}
        <ReputationBoard refreshKey={repKey} />
      </div>
    </main>
  );
}
