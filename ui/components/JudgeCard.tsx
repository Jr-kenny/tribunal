import type { Facet } from "@/lib/facets";
import type { JudgeView, Vote } from "@/lib/types";
import { Icon } from "./Icon";
import { TxLink } from "./TxLink";

const VOTE_STYLE: Record<Vote, { bg: string; fg: string; label: string }> = {
  PASS: { bg: "var(--pass-bg)", fg: "var(--pass)", label: "PASS" },
  FAIL: { bg: "var(--fail-bg)", fg: "var(--fail)", label: "FAIL" },
  UNCERTAIN: { bg: "var(--uncertain-bg)", fg: "var(--uncertain)", label: "UNCERTAIN" },
};

// A human answer to each facet's own question, so the card replies like a person
// ("No, it's not genuine") instead of a robotic label ("FAIL").
const ANSWERS: Record<string, Record<Vote, string>> = {
  authenticity: { PASS: "Yes, it looks genuine", FAIL: "No, it's not genuine", UNCERTAIN: "Can't really tell" },
  solvency: { PASS: "Yes, the money's there", FAIL: "No, the money isn't there", UNCERTAIN: "Can't really tell" },
  custodian: { PASS: "Yes, they're legit", FAIL: "No, they don't check out", UNCERTAIN: "Can't really tell" },
  valuation: { PASS: "Yes, it holds up", FAIL: "No, it doesn't hold up", UNCERTAIN: "Can't really tell" },
};
const GENERIC_ANSWER: Record<Vote, string> = { PASS: "Yes", FAIL: "No", UNCERTAIN: "Can't really tell" };
const humanAnswer = (facetKey: string, vote: Vote) => (ANSWERS[facetKey] ?? GENERIC_ANSWER)[vote];

function StatusLine({ view }: { view: JudgeView }) {
  if (view.status === "idle") return <span className="faint" style={{ fontSize: 12 }}>waiting…</span>;
  if (view.status === "fetching")
    return (
      <span className="dim" style={{ fontSize: 12, display: "inline-flex", gap: 6, alignItems: "center" }}>
        <Icon name="loader" size={13} className="spin" /> {view.detail ?? "fetching evidence…"}
      </span>
    );
  if (view.status === "judging")
    return (
      <span className="dim" style={{ fontSize: 12, display: "inline-flex", gap: 6, alignItems: "center" }}>
        <Icon name="loader" size={13} className="spin" /> running consensus…
      </span>
    );
  if (view.status === "error")
    return <span style={{ fontSize: 12, color: "var(--fail)" }}>{view.error ?? "error"}</span>;
  return null;
}

export function JudgeCard({ facet, view }: { facet: Facet; view: JudgeView }) {
  const decided = view.status === "verdict" || view.status === "submitted";
  const vs = view.vote ? VOTE_STYLE[view.vote] : null;
  return (
    <div
      className="card"
      style={{
        padding: "18px 18px",
        borderTop: `2px solid ${facet.color}`,
        opacity: view.status === "idle" ? 0.7 : 1,
        transition: "opacity 0.3s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <Icon name={facet.icon} size={18} color={facet.color} />
          <span style={{ fontWeight: 600, fontSize: 15 }}>{facet.name}</span>
          {facet.critical && (
            <Icon name="shield-alert" size={14} color={facet.color} />
          )}
        </div>
        {vs && (
          <span
            style={{
              background: vs.bg,
              color: vs.fg,
              fontSize: 11,
              fontWeight: 600,
              padding: "3px 9px",
              borderRadius: "var(--radius-pill)",
            }}
          >
            {vs.label}
          </span>
        )}
      </div>

      <p className="faint" style={{ fontSize: 12.5, marginBottom: 10 }}>{facet.question}</p>

      {decided && view.vote ? (
        <div>
          <p style={{ fontSize: 16, fontWeight: 600, color: vs?.fg, margin: "0 0 6px" }}>
            {humanAnswer(facet.key, view.vote)}
          </p>
          <p className="dim" style={{ fontSize: 12.5, marginBottom: 8, lineHeight: 1.55 }}>
            {view.confidence != null && (
              <span style={{ color: "var(--text)" }}>{(view.confidence / 100).toFixed(0)}% confident</span>
            )}
            {view.reason ? ` — ${view.reason}` : ""}
          </p>
          <div style={{ display: "flex", gap: 14 }}>
            {view.genlayerTx && <TxLink hash={view.genlayerTx} kind="genlayer" label="GenLayer tx" />}
            {view.submitTx && <TxLink hash={view.submitTx} kind="casper" label="Casper tx" />}
          </div>
        </div>
      ) : (
        <StatusLine view={view} />
      )}
    </div>
  );
}
