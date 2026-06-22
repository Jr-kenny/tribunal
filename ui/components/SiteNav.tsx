"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon";
import { WalletButton } from "./WalletButton";

const LINKS = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/registry", label: "Registry" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/demo", label: "Demo" },
];

export function SiteNav() {
  const path = usePathname();
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        borderBottom: "1px solid var(--border)",
        background: "rgba(12, 10, 28, 0.72)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div
        className="container"
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 62 }}
      >
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span
            style={{
              display: "grid",
              placeItems: "center",
              width: 30,
              height: 30,
              borderRadius: 8,
              background: "var(--accent-grad)",
            }}
          >
            <Icon name="gavel" size={17} color="#fff" />
          </span>
          <span style={{ fontWeight: 600, fontSize: 16, letterSpacing: "-0.02em" }}>Tribunal</span>
        </Link>

        <nav style={{ display: "flex", alignItems: "center", gap: 26 }}>
          {LINKS.map((l) => {
            const active = path === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                style={{
                  fontSize: 14,
                  color: active ? "var(--text)" : "var(--text-dim)",
                  fontWeight: active ? 500 : 400,
                }}
              >
                {l.label}
              </Link>
            );
          })}
          <WalletButton />
        </nav>
      </div>
    </header>
  );
}
