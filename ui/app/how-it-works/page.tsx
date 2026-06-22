import { Section } from "@/components/Section";
import { JudgeStrip } from "@/components/JudgeStrip";
import { Icon } from "@/components/Icon";

const LAYERS = [
  {
    icon: "gavel",
    title: "GenLayer judges",
    role: "The truth-fetchers",
    body: "One specialist judge per facet. Each fetches its own evidence under GenLayer consensus, so a whole room of validators agrees on the read before it rules. No judge trusts the issuer's paperwork.",
    color: "var(--judge-authenticity)",
  },
  {
    icon: "shield-dollar",
    title: "Casper contract",
    role: "The heart",
    body: "An Odra contract on Casper Testnet holds the verdicts, the federation logic (veto + reputation-weighted aggregation), the canonical outcome, and the reputation ledger. It's claim-agnostic: it only ever sees facets, votes, and confidences.",
    color: "var(--accent)",
  },
  {
    icon: "building-bank",
    title: "Orchestrator",
    role: "The notary",
    body: "An off-chain relay that runs each judge, then commits what they provably attested, signed by each judge's own Casper key. It makes no judgment of its own.",
    color: "var(--judge-custodian)",
  },
];

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div className="card" style={{ padding: "22px 22px", ...style }}>{children}</div>;
}

export default function HowItWorksPage() {
  return (
    <main>
      <Section eyebrow="How it works" title="A panel of specialists, federated on Casper.">
        <p className="dim" style={{ fontSize: 17, maxWidth: 700, lineHeight: 1.7 }}>
          Tribunal takes a real-world-asset claim and fans it out to four judges, each answering one
          narrow question with evidence it gathers itself. The contract settles all four into a single
          verdict, weighted by each judge&apos;s reputation, with one critical judge able to veto.
        </p>
      </Section>

      <Section eyebrow="The three layers" style={{ paddingTop: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
          {LAYERS.map((l) => (
            <Card key={l.title} style={{ borderTop: `2px solid ${l.color}` }}>
              <Icon name={l.icon} size={22} color={l.color} />
              <h3 style={{ fontSize: 18, margin: "12px 0 2px" }}>{l.title}</h3>
              <p style={{ fontSize: 12.5, color: l.color, marginBottom: 10, fontWeight: 500 }}>{l.role}</p>
              <p className="dim" style={{ fontSize: 14, lineHeight: 1.6 }}>{l.body}</p>
            </Card>
          ))}
        </div>
      </Section>

      <Section eyebrow="The panel" title="Four judges, four questions, four sources of truth.">
        <p className="dim" style={{ fontSize: 16, maxWidth: 680, lineHeight: 1.7, marginBottom: 24 }}>
          Each judge is matched to the right consensus rule for its source: an exact match where the
          data is deterministic, a tolerance band where it drifts.
        </p>
        <JudgeStrip />
      </Section>

      <Section eyebrow="The federation rule" title="Two passes, because the questions aren't equal.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
          <Card style={{ borderLeft: "2px solid var(--judge-solvency)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
              <span style={{ background: "var(--surface-raised)", borderRadius: 8, padding: "3px 9px", fontSize: 12, color: "var(--judge-solvency)", fontWeight: 600 }}>Pass 1</span>
              <h3 style={{ fontSize: 17 }}>The veto</h3>
            </div>
            <p className="dim" style={{ fontSize: 14.5, lineHeight: 1.7 }}>
              Any critical facet that FAILs with reputation-weighted confidence at or above the veto
              threshold sinks the whole claim to <span style={{ color: "var(--fail)" }}>NotBacked</span>,
              regardless of the others. Authentic paperwork over an empty vault is still unbacked.
            </p>
          </Card>
          <Card style={{ borderLeft: "2px solid var(--accent)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
              <span style={{ background: "var(--surface-raised)", borderRadius: 8, padding: "3px 9px", fontSize: 12, color: "var(--accent)", fontWeight: 600 }}>Pass 2</span>
              <h3 style={{ fontSize: 17 }}>The weighted score</h3>
            </div>
            <p className="dim" style={{ fontSize: 14.5, lineHeight: 1.7 }}>
              If nothing vetoes, the verdicts combine into a reputation- and weight-weighted score and
              map to a band. PASS adds confidence, FAIL subtracts it, and UNCERTAIN abstains, because
              &quot;we don&apos;t know&quot; is not the same as &quot;it&apos;s false.&quot;
            </p>
          </Card>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          {[
            { label: "NOT BACKED", range: "score ≤ 4000", color: "var(--fail)" },
            { label: "DISPUTED", range: "4000 – 7000", color: "var(--uncertain)" },
            { label: "BACKED", range: "score ≥ 7000", color: "var(--pass)" },
          ].map((b) => (
            <div key={b.label} className="card" style={{ padding: "12px 16px", flex: 1, minWidth: 160, borderTop: `2px solid ${b.color}` }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: b.color }}>{b.label}</p>
              <p className="faint mono" style={{ fontSize: 12, marginTop: 3 }}>{b.range}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section eyebrow="The reputation loop" title="The judges who get it right count for more." style={{ paddingTop: 0 }}>
        <p className="dim" style={{ fontSize: 16, maxWidth: 700, lineHeight: 1.7, marginBottom: 20 }}>
          When the truth comes out, every judge is graded on its own facet call. A correct call steps
          its on-chain reputation up; a wrong one slashes it. The federation weights each judge by that
          score, so reliable judges accrue weight over time.
        </p>
        <Card style={{ background: "var(--accent-soft)" }}>
          <p className="dim" style={{ fontSize: 14, marginBottom: 12 }}>
            Run live on Testnet (claim 13): three judges called their facet correctly and rose, the one
            that got it wrong was slashed. Read straight off the resolve transaction:
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {[
              { n: "Authenticity", v: "5000 → 5500", up: true },
              { n: "Solvency", v: "5000 → 5500", up: true },
              { n: "Custodian", v: "5000 → 5500", up: true },
              { n: "Valuation", v: "5000 → 4500", up: false },
            ].map((j) => (
              <div key={j.n} className="card" style={{ padding: "12px 16px", flex: 1, minWidth: 150 }}>
                <p style={{ fontSize: 13, marginBottom: 4 }}>{j.n}</p>
                <p className="mono" style={{ fontSize: 13, color: j.up ? "var(--pass)" : "var(--fail)", display: "flex", alignItems: "center", gap: 5 }}>
                  <Icon name={j.up ? "arrow-up" : "arrow-down"} size={13} color={j.up ? "var(--pass)" : "var(--fail)"} />
                  {j.v}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </Section>
    </main>
  );
}
