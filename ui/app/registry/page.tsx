"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Section } from "@/components/Section";
import { Icon } from "@/components/Icon";

type ClaimStatus = "Open" | "Backed" | "Disputed" | "NotBacked";

interface ClaimRecord {
  claimId: number;
  asset?: string;
  evidenceUri?: string;
  evidenceHash?: string;
  submitter?: string;
  status: ClaimStatus;
  score?: number;
}

const STATUS: Record<ClaimStatus, { label: string; color: string }> = {
  Open: { label: "PENDING", color: "var(--text-dim)" },
  Backed: { label: "BACKED", color: "var(--pass)" },
  Disputed: { label: "DISPUTED", color: "var(--uncertain)" },
  NotBacked: { label: "NOT BACKED", color: "var(--fail)" },
};

function StatusBadge({ status }: { status: ClaimStatus }) {
  const s = STATUS[status];
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: s.color,
        border: `1px solid ${s.color}`,
        padding: "3px 10px",
        borderRadius: "var(--radius-pill)",
        whiteSpace: "nowrap",
      }}
    >
      {s.label}
    </span>
  );
}

export default function RegistryPage() {
  const [claims, setClaims] = useState<ClaimRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [asset, setAsset] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function loadClaims() {
    fetch("/api/registry", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j.error) throw new Error(j.error);
        setClaims(j.claims);
      })
      .catch((e) => setError((e as Error).message));
  }

  useEffect(() => {
    loadClaims();
  }, []);

  async function submit() {
    if (!asset.trim() || !evidenceUrl.trim()) return;
    setSubmitting(true);
    setSubmitMsg(null);
    try {
      const r = await fetch("/api/registry/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset: asset.trim(), evidenceUrl: evidenceUrl.trim() }),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setSubmitMsg({ ok: true, text: `Registered as claim #${j.claimId}. The watcher will judge it shortly.` });
      setAsset("");
      setEvidenceUrl("");
      setTimeout(loadClaims, 1500);
    } catch (e) {
      setSubmitMsg({ ok: false, text: (e as Error).message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main>
      <Section eyebrow="Registry" title="Every claim, and what the tribunal ruled.">
        <p className="dim" style={{ fontSize: 16, maxWidth: 680, lineHeight: 1.7, marginBottom: 28 }}>
          A standing on-chain record of the real-world-asset claims submitted to Tribunal and the
          panel&apos;s verdict on each, read live from the Casper event log.
        </p>

        <div className="card" style={{ padding: 18, marginBottom: 24 }}>
          <p style={{ fontWeight: 500, fontSize: 15, marginBottom: 4 }}>Submit a claim to the registry</p>
          <p className="faint" style={{ fontSize: 12.5, marginBottom: 14 }}>
            Give an asset name and a public URL serving the evidence JSON. It&apos;s registered on Casper and
            the panel judges it automatically.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input
              value={asset}
              onChange={(e) => setAsset(e.target.value)}
              placeholder="Asset name"
              disabled={submitting}
              style={{ flex: "1 1 200px", background: "var(--bg-1)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "10px 12px", fontSize: 14 }}
            />
            <input
              value={evidenceUrl}
              onChange={(e) => setEvidenceUrl(e.target.value)}
              placeholder="https://… evidence JSON URL"
              disabled={submitting}
              style={{ flex: "2 1 280px", background: "var(--bg-1)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "10px 12px", fontSize: 14, fontFamily: "var(--font-mono)" }}
            />
            <button className="btn btn-primary" onClick={submit} disabled={submitting}>
              {submitting ? <><Icon name="loader" size={15} color="#fff" className="spin" /> Registering…</> : <><Icon name="plus" size={15} color="#fff" /> Register</>}
            </button>
          </div>
          {submitMsg && (
            <p style={{ fontSize: 13, marginTop: 12, color: submitMsg.ok ? "var(--pass)" : "var(--fail)" }}>{submitMsg.text}</p>
          )}
        </div>

        {error && (
          <div className="card" style={{ padding: 18, borderColor: "var(--fail)" }}>
            <span style={{ color: "var(--fail)", fontSize: 14 }}>Couldn&apos;t read the registry: {error}</span>
          </div>
        )}

        {!error && !claims && <p className="faint" style={{ fontSize: 14 }}>reading the chain…</p>}

        {(() => {
          if (!claims) return null;
          const shown = claims.filter((c) => c.asset); // only real submitted claims, not internal test ones
          if (shown.length === 0) return <p className="faint" style={{ fontSize: 14 }}>No claims registered yet.</p>;
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {shown.map((c) => (
                <Link
                  key={c.claimId}
                  href={`/registry/${c.claimId}`}
                  className="card"
                  style={{ padding: "16px 20px", borderLeft: `2px solid ${STATUS[c.status].color}`, display: "block" }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontWeight: 600, fontSize: 16 }}>{c.asset}</span>
                      <span className="faint" style={{ fontSize: 12 }}>#{c.claimId}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                      {c.score != null && c.status !== "Open" && (
                        <span className="mono" style={{ fontSize: 13, color: "var(--text-dim)" }}>{(c.score / 100).toFixed(0)}%</span>
                      )}
                      <StatusBadge status={c.status} />
                      <Icon name="arrow-right" size={15} color="var(--text-dim)" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          );
        })()}
      </Section>
    </main>
  );
}
