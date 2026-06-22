"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    fetch("/api/registry", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j.error) throw new Error(j.error);
        setClaims(j.claims);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  return (
    <main>
      <Section eyebrow="Registry" title="Every claim, and what the tribunal ruled.">
        <p className="dim" style={{ fontSize: 16, maxWidth: 680, lineHeight: 1.7, marginBottom: 28 }}>
          A standing on-chain record of the real-world-asset claims submitted to Tribunal and the
          panel&apos;s verdict on each, read live from the Casper event log.
        </p>

        {error && (
          <div className="card" style={{ padding: 18, borderColor: "var(--fail)" }}>
            <span style={{ color: "var(--fail)", fontSize: 14 }}>Couldn&apos;t read the registry: {error}</span>
          </div>
        )}

        {!error && !claims && <p className="faint" style={{ fontSize: 14 }}>reading the chain…</p>}

        {claims && claims.length === 0 && (
          <p className="faint" style={{ fontSize: 14 }}>No claims registered yet.</p>
        )}

        {claims && claims.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {claims.map((c) => (
              <div
                key={c.claimId}
                className="card"
                style={{ padding: "16px 20px", borderLeft: `2px solid ${STATUS[c.status].color}` }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, fontSize: 16 }}>
                        {c.asset ?? `Untitled claim #${c.claimId}`}
                      </span>
                      <span className="faint" style={{ fontSize: 12 }}>#{c.claimId}</span>
                    </div>
                    {c.evidenceUri && (
                      <a
                        href={c.evidenceUri}
                        target="_blank"
                        rel="noreferrer"
                        style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, color: "var(--accent)" }}
                      >
                        evidence <Icon name="external-link" size={12} color="var(--accent)" />
                      </a>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    {c.score != null && c.status !== "Open" && (
                      <span className="mono" style={{ fontSize: 13, color: "var(--text-dim)" }}>
                        {(c.score / 100).toFixed(0)}%
                      </span>
                    )}
                    <StatusBadge status={c.status} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </main>
  );
}
