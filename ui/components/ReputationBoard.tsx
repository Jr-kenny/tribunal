"use client";

import { useEffect, useState, useCallback } from "react";
import { facetByKey } from "@/lib/facets";

interface Judge {
  key: string;
  name: string;
  color: string;
  bps: number | null;
}

export function ReputationBoard({ refreshKey = 0 }: { refreshKey?: number }) {
  const [judges, setJudges] = useState<Judge[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/reputation", { cache: "no-store" });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setJudges(j.judges);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  return (
    <div className="card" style={{ padding: "22px 24px" }}>
      <p className="faint" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 16 }}>
        Reputation board · on-chain
      </p>
      {error && <p style={{ fontSize: 13, color: "var(--fail)" }}>Couldn&apos;t read on-chain: {error}</p>}
      {!error && !judges && <p className="faint" style={{ fontSize: 13 }}>reading…</p>}
      {judges && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {judges.map((j) => {
            const f = facetByKey(j.key);
            const pct = j.bps != null ? Math.min(100, Math.round((j.bps / 10000) * 100)) : 0;
            return (
              <div key={j.key}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: f?.color ?? "var(--accent)" }} />
                    {j.name}
                  </span>
                  <span className="mono" style={{ fontSize: 13, color: "var(--text)" }}>
                    {j.bps != null ? j.bps.toLocaleString() : "—"}
                    <span className="faint" style={{ fontSize: 11 }}> bps</span>
                  </span>
                </div>
                <div style={{ height: 5, borderRadius: 3, background: "var(--surface-raised)", overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: f?.color ?? "var(--accent)" }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
