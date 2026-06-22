import { FACETS } from "@/lib/facets";
import type { JudgeView } from "@/lib/types";
import { JudgeCard } from "./JudgeCard";

export function JudgePanel({ views }: { views: Record<string, JudgeView> }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
        gap: 14,
      }}
    >
      {FACETS.map((f) => (
        <JudgeCard key={f.key} facet={f} view={views[f.key] ?? { status: "idle" }} />
      ))}
    </div>
  );
}
