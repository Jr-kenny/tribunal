import { NextResponse } from "next/server";
import { readClaimEvents } from "../../../../orchestrator/src/events.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/registry -> every claim from the on-chain event log, newest first.
export async function GET() {
  try {
    const claims = await readClaimEvents();
    return NextResponse.json({ claims });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message ?? "failed to read the registry" }, { status: 500 });
  }
}
