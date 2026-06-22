import type { ClaimStatus } from "@/lib/types";
import { TxLink } from "./TxLink";

const STATUS_STYLE: Record<ClaimStatus, { color: string; label: string }> = {
  Open: { color: "var(--text-dim)", label: "OPEN" },
  Backed: { color: "var(--pass)", label: "BACKED" },
  Disputed: { color: "var(--uncertain)", label: "DISPUTED" },
  NotBacked: { color: "var(--fail)", label: "NOT BACKED" },
};

export function VerdictCard({
  status,
  finalizeTx,
  why,
}: {
  status: ClaimStatus;
  finalizeTx?: string;
  why?: string;
}) {
  const s = STATUS_STYLE[status];
  return (
    <div className="card" style={{ padding: "22px 24px" }}>
      <p className="faint" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 10 }}>
        Federated verdict
      </p>
      <div style={{ fontSize: 30, fontWeight: 600, color: s.color, marginBottom: 8, letterSpacing: "-0.02em" }}>
        {s.label}
      </div>
      {why && <p className="dim" style={{ fontSize: 14, marginBottom: finalizeTx ? 10 : 0 }}>{why}</p>}
      {finalizeTx && <TxLink hash={finalizeTx} kind="casper" label="finalize tx on Casper" />}
    </div>
  );
}
