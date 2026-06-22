export function Section({
  eyebrow,
  title,
  children,
  style,
}: {
  eyebrow?: string;
  title?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <section style={{ padding: "64px 0", ...style }}>
      <div className="container">
        {eyebrow && (
          <p
            style={{
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              fontSize: 12,
              color: "var(--accent)",
              marginBottom: 12,
              fontWeight: 500,
            }}
          >
            {eyebrow}
          </p>
        )}
        {title && (
          <h2 style={{ fontSize: 30, maxWidth: 640, marginBottom: 28 }}>{title}</h2>
        )}
        {children}
      </div>
    </section>
  );
}
