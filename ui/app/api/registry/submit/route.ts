import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { openClaimWithEvidence } from "../../../../../orchestrator/src/casper.js";
import { confirm, claimIdFromOpen } from "../../../../../orchestrator/src/chainread.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST /api/registry/submit { asset, evidenceUrl }
// Fetches the evidence URL, hashes it, and registers the claim on-chain. The
// watcher then picks it up and judges it. The evidence stays at the user's URL;
// we only commit the asset, the URL, and the hash.
export async function POST(req: Request) {
  try {
    const { asset, evidenceUrl } = (await req.json()) as { asset?: string; evidenceUrl?: string };
    if (!asset || !evidenceUrl) {
      return NextResponse.json({ error: "asset and evidenceUrl are required" }, { status: 400 });
    }

    let text: string;
    try {
      const res = await fetch(evidenceUrl);
      if (!res.ok) throw new Error(`evidence URL returned ${res.status}`);
      text = await res.text();
    } catch (e) {
      return NextResponse.json({ error: `couldn't fetch the evidence URL: ${(e as Error).message}` }, { status: 400 });
    }
    try {
      JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "the evidence URL must serve JSON" }, { status: 400 });
    }

    const hash = crypto.createHash("sha256").update(text).digest("hex");
    const tx = await openClaimWithEvidence(asset, evidenceUrl, hash);
    const info = await confirm(tx);
    const claimId = claimIdFromOpen(info);
    return NextResponse.json({ claimId, tx });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message ?? "failed to register claim" }, { status: 500 });
  }
}
