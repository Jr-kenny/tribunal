import { Icon } from "./Icon";

// Casper tx -> cspr.live; GenLayer tx -> genlayer explorer.
export function TxLink({ hash, kind = "casper", label }: { hash: string; kind?: "casper" | "genlayer"; label?: string }) {
  if (!hash) return null;
  const href =
    kind === "casper"
      ? `https://testnet.cspr.live/transaction/${hash}`
      : `https://studio.genlayer.com/explorer/transaction/${hash}`;
  const short = `${hash.slice(0, 6)}…${hash.slice(-4)}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--accent)" }}
    >
      {label ?? short} <Icon name="external-link" size={12} color="var(--accent)" />
    </a>
  );
}
