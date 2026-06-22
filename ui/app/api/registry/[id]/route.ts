import { NextResponse } from "next/server";
import { readClaimEvents } from "../../../../../orchestrator/src/events.js";
import { readVerdictMaybe } from "../../../../../orchestrator/src/genlayer.js";
import { FACETS } from "../../../../../orchestrator/src/orchestrate.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/registry/[id] -> one claim: its registry record, the evidence it
// points to, and each judge's verdict (with the reason) read from GenLayer.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const claimId = Number(id);
    const claim = (await readClaimEvents()).find((c) => c.claimId === claimId);
    if (!claim) return NextResponse.json({ error: "claim not found" }, { status: 404 });

    // fetch the evidence the claim points to (rendered in-app, not as a raw file)
    let evidence: unknown = null;
    if (claim.evidenceUri) {
      try {
        const res = await fetch(claim.evidenceUri);
        if (res.ok) evidence = await res.json();
      } catch {
        /* evidence unreachable; leave null */
      }
    }

    // each judge's verdict (vote, confidence, reason) from GenLayer; only meaningful
    // once the claim has been judged
    let verdicts: { facet: string; name: string; color: string; critical: boolean; vote: string; confidence: number; reason: string }[] = [];
    if (claim.status !== "Open") {
      const reads = await Promise.all(
        FACETS.map(async (f: (typeof FACETS)[number]) => {
          const v = f.judge ? await readVerdictMaybe(f.judge, String(claimId), f.genlayerKey) : null;
          return v ? { facet: f.key, name: f.key, color: "", critical: f.critical, vote: v.vote, confidence: v.confidence, reason: v.reason } : null;
        }),
      );
      verdicts = reads.filter(Boolean) as typeof verdicts;
    }

    return NextResponse.json({ claim, evidence, verdicts });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message ?? "failed to read claim" }, { status: 500 });
  }
}
