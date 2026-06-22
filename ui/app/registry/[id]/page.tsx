"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Section } from "@/components/Section";
import { Icon } from "@/components/Icon";
import { facetByKey } from "@/lib/facets";

type ClaimStatus = "Open" | "Backed" | "Disputed" | "NotBacked";

interface Detail {
  claim: { claimId: number; asset?: string; evidenceUri?: string; status: ClaimStatus; score?: number; submitter?: string };
  evidence: Record<string, unknown> | null;
  verdicts: { facet: string; vote: string; confidence: number; reason: string; critical: boolean }[];
}

const STATUS: Record<ClaimStatus, { label: string; color: string; blurb: string }> = {
  Open: { label: "PENDING", color: "var(--text-dim)", blurb: "Registered, waiting for the panel to judge it." },
  Backed: { label: "BACKED", color: "var(--pass)", blurb: "The panel found the claim holds up." },
  Disputed: { label: "DISPUTED", color: "var(--uncertain)", blurb: "The panel was split: a real soft spot, no confident ruling." },
  NotBacked: { label: "NOT BACKED", color: "var(--fail)", blurb: "The panel rejected the claim." },
};

const VOTE_COLOR: Record<string, string> = { PASS: "var(--pass)", FAIL: "var(--fail)", UNCERTAIN: "var(--uncertain)" };

export default function ClaimDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/registry/${id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j.error) throw new Error(j.error);
        setD(j);
      })
      .catch((e) => setError((e as Error).message));
  }, [id]);

  return (
    <main>
      <Section eyebrow="Registry" title={d?.claim.asset ?? (error ? "Claim" : "Loading…")}>
        <Link href="/registry" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-dim)", marginBottom: 20 }}>
          <Icon name="arrow-left" size={14} /> Back to the registry
        </Link>

        {error && <p style={{ color: "var(--fail)", fontSize: 14 }}>{error}</p>}

        {d && (
          <>
            <div className="card" style={{ padding: "20px 22px", borderLeft: `2px solid ${STATUS[d.claim.status].color}`, marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                <span style={{ fontSize: 22, fontWeight: 600, color: STATUS[d.claim.status].color }}>{STATUS[d.claim.status].label}</span>
                {d.claim.score != null && d.claim.status !== "Open" && (
                  <span className="mono dim" style={{ fontSize: 14 }}>{(d.claim.score / 100).toFixed(0)}%</span>
                )}
                <span className="faint" style={{ fontSize: 12 }}>claim #{d.claim.claimId}</span>
              </div>
              <p className="dim" style={{ fontSize: 14 }}>{STATUS[d.claim.status].blurb}</p>
            </div>

            {d.verdicts.length > 0 && (
              <>
                <h3 style={{ fontSize: 16, margin: "24px 0 12px" }}>What each judge found</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginBottom: 8 }}>
                  {d.verdicts.map((v) => {
                    const f = facetByKey(v.facet);
                    return (
                      <div key={v.facet} className="card" style={{ padding: "16px 18px", borderTop: `2px solid ${f?.color ?? "var(--accent)"}` }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: 14 }}>
                            {f && <Icon name={f.icon} size={16} color={f.color} />}
                            {f?.name ?? v.facet}
                            {v.critical && <Icon name="shield-alert" size={13} color={f?.color} />}
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 600, color: VOTE_COLOR[v.vote] ?? "var(--text-dim)" }}>{v.vote}</span>
                        </div>
                        <p className="dim" style={{ fontSize: 12.5, lineHeight: 1.55 }}>
                          <span style={{ color: "var(--text)" }}>{(v.confidence / 100).toFixed(0)}% confident</span>
                          {v.reason ? ` — ${v.reason}` : ""}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            <h3 style={{ fontSize: 16, margin: "28px 0 12px" }}>The evidence</h3>
            {d.evidence ? (
              <div className="card" style={{ padding: "8px 4px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                  <tbody>
                    {Object.entries(d.evidence).map(([k, val]) => (
                      <tr key={k} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "10px 14px", color: "var(--text-dim)", verticalAlign: "top", whiteSpace: "nowrap", width: 1 }}>{k}</td>
                        <td className="mono" style={{ padding: "10px 14px", wordBreak: "break-word" }}>{typeof val === "object" ? JSON.stringify(val) : String(val)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="faint" style={{ fontSize: 13 }}>
                {d.claim.evidenceUri ? "The evidence URL couldn't be reached." : "No evidence pointer on this claim."}
              </p>
            )}
            {d.claim.evidenceUri && (
              <a href={d.claim.evidenceUri} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--accent)", marginTop: 10 }}>
                raw source <Icon name="external-link" size={12} color="var(--accent)" />
              </a>
            )}
          </>
        )}
      </Section>
    </main>
  );
}
