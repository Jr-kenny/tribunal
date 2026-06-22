import Link from "next/link";
import { Hero } from "@/components/Hero";
import { JudgeStrip } from "@/components/JudgeStrip";
import { Section } from "@/components/Section";
import { Icon } from "@/components/Icon";

export default function LandingPage() {
  return (
    <main>
      <Hero />

      <div className="container" style={{ marginTop: 8 }}>
        <JudgeStrip />
      </div>

      <Section eyebrow="The problem" title="Real-world-asset claims are taken on trust.">
        <p className="dim" style={{ fontSize: 17, maxWidth: 680, lineHeight: 1.7 }}>
          Someone says a token is backed by ten million dollars of real assets and hands you
          paperwork. Today you mostly take their word for it. Tribunal doesn&apos;t. It sends in a
          panel of specialist inspectors, and each one gathers its own evidence instead of trusting
          the issuer&apos;s say-so.
        </p>
      </Section>

      <Section eyebrow="The veto" title="Not every question carries the same weight." style={{ paddingTop: 0 }}>
        <div className="card" style={{ padding: "28px 28px", maxWidth: 760, borderLeft: "2px solid var(--judge-solvency)" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <Icon name="shield-alert" size={22} color="var(--judge-solvency)" />
            <p style={{ fontSize: 17, lineHeight: 1.7 }}>
              If the solvency inspector reads the chain and the money isn&apos;t in the vault, it&apos;s
              over. The paperwork can be pretty and the custodian can be reputable, but an empty vault
              means <span style={{ color: "var(--fail)" }}>not backed</span>, period. One critical
              judge can sink the whole claim. That&apos;s what beats a naive majority vote.
            </p>
          </div>
        </div>
      </Section>

      <Section eyebrow="The reputation" title="The judges who get it right count for more." style={{ paddingTop: 0 }}>
        <p className="dim" style={{ fontSize: 17, maxWidth: 680, lineHeight: 1.7, marginBottom: 20 }}>
          When the truth comes out, every judge is graded on its own call. Right calls build its
          on-chain reputation, wrong calls slash it, and the federation weights each judge by that
          score. Over time the reliable inspectors rise and the sloppy ones fade, automatically.
        </p>
        <Link href="/how-it-works" className="btn" style={{ fontSize: 14 }}>
          See the full mechanism <Icon name="arrow-right" size={15} />
        </Link>
      </Section>

      <Section style={{ paddingTop: 8 }}>
        <div
          className="card"
          style={{
            padding: "40px 32px",
            textAlign: "center",
            background: "var(--accent-soft)",
            borderColor: "var(--border-strong)",
          }}
        >
          <h2 style={{ fontSize: 26, marginBottom: 12 }}>Watch a claim get judged, live on Casper.</h2>
          <p className="dim" style={{ fontSize: 16, marginBottom: 24, maxWidth: 520, marginInline: "auto" }}>
            Run the panel on a real claim and see the four judges report, the verdict settle, and the
            reputation board move, all on-chain.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/dashboard" className="btn btn-primary">
              <Icon name="play" size={16} color="#fff" /> Open the dashboard
            </Link>
            <Link href="/demo" className="btn">
              Guided demo
            </Link>
          </div>
        </div>
      </Section>
    </main>
  );
}
