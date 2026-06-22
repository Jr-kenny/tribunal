import { NextResponse } from "next/server";
import { readAllReputation } from "../../../../orchestrator/src/reputation-read.js";
import { FACETS } from "@/lib/facets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/reputation -> each judge's current on-chain reputation, descending.
export async function GET() {
  try {
    const rows = await readAllReputation();
    const judges = rows.map((r) => {
      const f = FACETS.find((x) => x.key === r.key);
      return { key: r.key, name: f?.name ?? r.key, color: f?.color ?? "var(--accent)", bps: r.bps };
    });
    return NextResponse.json({ judges });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message ?? "failed to read reputation" }, { status: 500 });
  }
}
