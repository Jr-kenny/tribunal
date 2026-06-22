import { FACETS } from "@/lib/facets";
import { Icon } from "./Icon";

export function JudgeStrip() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 16,
      }}
    >
      {FACETS.map((f) => (
        <div
          key={f.key}
          className="card"
          style={{
            padding: "22px 20px",
            borderTop: `2px solid ${f.color}`,
            position: "relative",
          }}
        >
          <div
            style={{
              display: "grid",
              placeItems: "center",
              width: 42,
              height: 42,
              borderRadius: 11,
              background: "var(--surface-raised)",
              marginBottom: 14,
            }}
          >
            <Icon name={f.icon} size={21} color={f.color} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 16 }}>{f.name}</span>
            {f.critical && (
              <span
                className="pill"
                style={{
                  fontSize: 10.5,
                  padding: "2px 8px",
                  color: f.color,
                  borderColor: f.color,
                }}
              >
                can veto
              </span>
            )}
          </div>
          <p className="dim" style={{ fontSize: 14, marginBottom: 10 }}>
            {f.question}
          </p>
          <p className="faint" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
            {f.fetches}
          </p>
        </div>
      ))}
    </div>
  );
}
