"use client";

import { Icon } from "./Icon";

export const EXAMPLE_CLAIMS = [
  { key: "claim-lying", label: "Lying claim — attests $12.5M, wallet holds ~2687 CSPR" },
  { key: "claim-backed", label: "Backed note — reserve genuinely covers it" },
  { key: "claim-unbacked", label: "Unbacked — reserves fall short of liabilities" },
  { key: "custom", label: "Custom claim — write your own…" },
];

// A starting point for a custom claim. The reserve_wallet is a real Casper key so
// solvency has something live to read; edit any field to point at your own asset.
export const CUSTOM_TEMPLATE = JSON.stringify(
  {
    asset: "My tokenized note",
    denomination: "CSPR",
    stated_liabilities_cspr: 1000,
    reserve_wallet: "016c7e59de3b380b62cd1a65c63fb0c2a54be80e8cb9aee92b833d77776fcd5dc6",
    custodian: "BitGo",
    document_url: "https://www.gnu.org/licenses/gpl-3.0.txt",
    document_sha256: "3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986",
    price_symbol: "casper-network",
  },
  null,
  2,
);

export function ClaimForm({
  claimKey,
  onClaimKey,
  evidence,
  onEvidence,
  onRun,
  running,
}: {
  claimKey: string;
  onClaimKey: (v: string) => void;
  evidence: string;
  onEvidence: (v: string) => void;
  onRun: () => void;
  running: boolean;
}) {
  const custom = claimKey === "custom";
  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <select
          value={claimKey}
          onChange={(e) => onClaimKey(e.target.value)}
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

      {custom && (
        <div style={{ marginTop: 12 }}>
          <textarea
            value={evidence}
            onChange={(e) => onEvidence(e.target.value)}
            disabled={running}
            spellCheck={false}
            rows={12}
            style={{
              width: "100%",
              background: "var(--bg-1)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "12px 14px",
              fontSize: 13,
              fontFamily: "var(--font-mono)",
              lineHeight: 1.6,
              resize: "vertical",
            }}
          />
          <p className="faint" style={{ fontSize: 12, marginTop: 8, lineHeight: 1.6 }}>
            The judges fetch real data, so for each one to do real work the evidence needs:{" "}
            <span style={{ color: "var(--judge-solvency)" }}>reserve_wallet</span> (a real Casper key),{" "}
            <span style={{ color: "var(--judge-custodian)" }}>custodian</span> (a real name),{" "}
            <span style={{ color: "var(--judge-authenticity)" }}>document_url</span> +{" "}
            <span style={{ color: "var(--judge-authenticity)" }}>document_sha256</span>, and{" "}
            <span style={{ color: "var(--judge-valuation)" }}>price_symbol</span> (a CoinGecko id). A
            missing or bogus field just makes that judge return UNCERTAIN or FAIL, which is the correct call.
          </p>
        </div>
      )}
    </div>
  );
}
