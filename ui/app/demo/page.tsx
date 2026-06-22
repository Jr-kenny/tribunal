import Link from "next/link";
import { Section } from "@/components/Section";
import { Icon } from "@/components/Icon";

function Beat({
  n,
  title,
  children,
  accent = "var(--accent)",
}: {
  n: number;
  title: string;
  children: React.ReactNode;
  accent?: string;
}) {
  return (
    <div style={{ display: "flex", gap: 18, marginBottom: 22 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <span
          style={{
            display: "grid",
            placeItems: "center",
            width: 34,
            height: 34,
            borderRadius: "50%",
            border: `1px solid ${accent}`,
            color: accent,
            fontSize: 14,
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          {n}
        </span>
        <span style={{ flex: 1, width: 1, background: "var(--border)", marginTop: 6 }} />
      </div>
      <div className="card" style={{ padding: "18px 20px", flex: 1, marginBottom: 4 }}>
        <h3 style={{ fontSize: 17, marginBottom: 8 }}>{title}</h3>
        <div className="dim" style={{ fontSize: 14.5, lineHeight: 1.7 }}>{children}</div>
      </div>
    </div>
  );
}

export default function DemoPage() {
  return (
    <main>
      <Section eyebrow="Demo" title="A lying claim, judged end to end.">
        <p className="dim" style={{ fontSize: 17, maxWidth: 700, lineHeight: 1.7 }}>
          Here&apos;s the sharpest case: an issuer&apos;s paperwork claims full backing, but the chain
          says otherwise. Watch how the panel catches it and why one judge is enough to sink the claim.
        </p>
      </Section>

      <div className="container" style={{ paddingBottom: 8 }}>
        <Beat n={1} title="The claim arrives">
          Token XYZ is presented as a tokenized US T-bill fund. The attestation states{" "}
          <span style={{ color: "var(--text)" }}>full backing with a 25% over-collateralization buffer</span>,
          reserves of $12.5M against $10M of liabilities, custody confirmed. On paper, it looks great.
        </Beat>

        <Beat n={2} title="The panel gathers its own evidence" accent="var(--judge-authenticity)">
          Instead of trusting the paperwork, each judge fetches its own truth under GenLayer consensus:
          authenticity hashes the referenced document, custodian looks the named custodian up in a public
          record, valuation reads the live market price, and solvency reads the reserve wallet&apos;s
          balance live off Casper.
        </Beat>

        <Beat n={3} title="Solvency reads the chain" accent="var(--judge-solvency)">
          The reserve wallet that&apos;s supposed to hold $12.5M actually holds about{" "}
          <span style={{ color: "var(--fail)" }}>2687 CSPR</span>. A judge trusting the paperwork would
          pass this. The solvency judge, reading the chain, returns{" "}
          <span style={{ color: "var(--fail)", fontWeight: 600 }}>FAIL</span> at high confidence.
        </Beat>

        <Beat n={4} title="The veto fires" accent="var(--judge-solvency)">
          Solvency is the critical facet. Its confident FAIL clears the veto threshold, so the contract
          returns <span style={{ color: "var(--fail)", fontWeight: 600 }}>NOT BACKED</span> regardless of
          the other facets. The paperwork being pretty doesn&apos;t matter when the vault is empty.
        </Beat>

        <Beat n={5} title="It settles on Casper" accent="var(--pass)">
          The verdict, each judge&apos;s vote, and the GenLayer proof hashes are all recorded on-chain,
          queryable forever. When ground truth lands, the judges who called it right gain reputation and
          the ones who didn&apos;t lose it.
        </Beat>
      </div>

      <Section style={{ paddingTop: 16 }}>
        <div className="card" style={{ padding: "32px", textAlign: "center", background: "var(--accent-soft)" }}>
          <h2 style={{ fontSize: 24, marginBottom: 10 }}>See it happen live.</h2>
          <p className="dim" style={{ fontSize: 15, marginBottom: 22, maxWidth: 480, marginInline: "auto" }}>
            Run this exact claim on the dashboard and watch the four judges report and the verdict settle
            on Casper Testnet in real time.
          </p>
          <Link href="/dashboard" className="btn btn-primary">
            <Icon name="play" size={16} color="#fff" /> Run it on the dashboard
          </Link>
        </div>
      </Section>
    </main>
  );
}
