import { readFileSync } from "node:fs";
import path from "node:path";
import { openClaim } from "../../../../../orchestrator/src/casper.js";
import { relayPanel } from "../../../../../orchestrator/src/orchestrate.js";
import { confirm, claimIdFromOpen, statusFromDiff } from "../../../../../orchestrator/src/chainread.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800; // a live panel run can take minutes

const EXAMPLES: Record<string, string> = {
  "claim-backed": "claim-backed.json",
  "claim-unbacked": "claim-unbacked.json",
  "claim-lying": "claim-lying.json",
};

function loadEvidence(body: { claimKey?: string; evidence?: string }): string {
  if (body.evidence) return body.evidence;
  const file = EXAMPLES[body.claimKey ?? ""];
  if (!file) throw new Error("provide a known claimKey or raw evidence");
  // dev server runs from ui/, so the examples sit one level up in orchestrator/
  return readFileSync(path.join(process.cwd(), "..", "orchestrator", "examples", file), "utf8");
}

// POST /api/claim/run -> opens a claim, runs the panel, streams progress as SSE.
export async function POST(req: Request) {
  let evidence: string;
  try {
    evidence = loadEvidence(await req.json());
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      try {
        const openTx = await openClaim();
        const openInfo = await confirm(openTx);
        const claimId = claimIdFromOpen(openInfo);
        send({ type: "claim-opened", claimId, tx: openTx });

        const result = await relayPanel(claimId, evidence, (e) => send(e));

        const finInfo = await confirm(result.finalizeTx);
        const status = statusFromDiff(openInfo, finInfo);
        send({ type: "finalized", status, finalizeTx: result.finalizeTx });
        send({ type: "done" });
      } catch (e) {
        send({ type: "error", message: (e as Error).message ?? "run failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
