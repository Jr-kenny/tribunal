import Link from "next/link";
import { Icon } from "./Icon";

export function Hero() {
  return (
    <section style={{ padding: "84px 0 56px", textAlign: "center", position: "relative" }}>
      <div className="container" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <span className="pill" style={{ marginBottom: 24, color: "var(--text-dim)" }}>
          <span className="live-dot" /> Live on Casper Testnet
        </span>

        <h1 style={{ fontSize: 52, lineHeight: 1.08, maxWidth: 720, marginBottom: 20 }}>
          Don&apos;t trust the paperwork.
          <br />
          <span
            style={{
              background: "var(--accent-grad)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            Send in the panel.
          </span>
        </h1>

        <p className="dim" style={{ fontSize: 18, maxWidth: 560, marginBottom: 34, lineHeight: 1.6 }}>
          A panel of specialist GenLayer judges each verifies one facet of a real-world-asset
          claim. Casper federates their verdicts and stakes their reputation.
        </p>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
          <Link href="/dashboard" className="btn btn-primary">
            Open the dashboard <Icon name="arrow-right" size={16} color="#fff" />
          </Link>
          <Link href="/how-it-works" className="btn">
            See how it works
          </Link>
        </div>
      </div>
    </section>
  );
}
