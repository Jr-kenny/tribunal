"use client";

import { Icon } from "./Icon";

export const EXAMPLE_CLAIMS = [
  { key: "claim-lying", label: "Lying claim — attests $12.5M, wallet holds ~2687 CSPR" },
  { key: "claim-backed", label: "Backed note — reserve genuinely covers it" },
  { key: "claim-unbacked", label: "Unbacked — reserves fall short of liabilities" },
];

export function ClaimForm({
  value,
  onChange,
  onRun,
  running,
}: {
  value: string;
  onChange: (v: string) => void;
  onRun: () => void;
  running: boolean;
}) {
  return (
    <div
      className="card"
      style={{ padding: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}
    >
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={running}
        style={{
          flex: 1,
          minWidth: 260,
          background: "var(--bg-1)",
          color: "var(--text)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "10px 12px",
          fontSize: 14,
        }}
      >
        {EXAMPLE_CLAIMS.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label}
          </option>
        ))}
      </select>
      <button className="btn btn-primary" onClick={onRun} disabled={running} style={{ opacity: running ? 0.7 : 1 }}>
        {running ? (
          <>
            <Icon name="loader" size={16} color="#fff" className="spin" /> Running…
          </>
        ) : (
          <>
            <Icon name="play" size={16} color="#fff" /> Run panel
          </>
        )}
      </button>
    </div>
  );
}
