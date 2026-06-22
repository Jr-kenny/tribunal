import Link from "next/link";
import { Icon } from "./Icon";

export function Footer() {
  return (
    <footer style={{ borderTop: "1px solid var(--border)", marginTop: 80 }}>
      <div
        className="container"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "28px 24px",
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <Icon name="gavel" size={16} color="var(--accent)" />
          <span className="dim" style={{ fontSize: 14 }}>
            Tribunal — a multi-agent RWA verification oracle on Casper
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <Link
            href="https://github.com/Jr-kenny/tribunal"
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: "var(--text-dim)" }}
          >
            <Icon name="github" size={16} /> GitHub
          </Link>
          <span className="faint" style={{ fontSize: 13 }}>
            Casper Agentic Buildathon 2026
          </span>
        </div>
      </div>
    </footer>
  );
}
