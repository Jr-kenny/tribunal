// HTTP service for hosting the orchestrator on Render (or any long-running host).
//
// Why this exists: the live panel run takes minutes, which a Vercel Hobby
// function (60s cap) can't hold. So the long work lives here on Render, and the
// Vercel UI calls these endpoints. The CSPR.cloud bridge runs in-process on
// localhost, so every Casper write gets its auth header without the proxy ever
// being public.
//
//   POST /claim/run    -> open a claim, run the panel, stream progress as SSE
//   POST /claim/submit  { asset, evidenceUrl } -> register a claim on-chain
//   GET  /health        -> ok
//
// Env: PORT (Render provides it), ALLOWED_ORIGIN (the Vercel origin, or * ),
//      plus the usual orchestrator/proxy vars. CASPER_NODE_URL should point at
//      the in-process proxy, e.g. http://127.0.0.1:7777/rpc.

import http from "node:http";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { startProxy } from "./proxy.js";
import { openClaim, openClaimWithEvidence } from "./casper.js";
import { relayPanel } from "./orchestrate.js";
import { confirm, claimIdFromOpen, statusFromDiff } from "./chainread.js";

const PORT = Number(process.env.PORT ?? 8080);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? "*";
const EXAMPLES_DIR = fileURLToPath(new URL("../examples/", import.meta.url));

const EXAMPLES: Record<string, string> = {
  "claim-backed": "claim-backed.json",
  "claim-unbacked": "claim-unbacked.json",
  "claim-lying": "claim-lying.json",
};

function corsHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    ...extra,
  };
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function json(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, corsHeaders({ "Content-Type": "application/json" }));
  res.end(JSON.stringify(body));
}

function loadEvidence(body: { claimKey?: string; evidence?: string }): string {
  if (body.evidence) return body.evidence;
  const file = EXAMPLES[body.claimKey ?? ""];
  if (!file) throw new Error("provide a known claimKey or raw evidence");
  return readFileSync(EXAMPLES_DIR + file, "utf8");
}

// POST /claim/run -> open a claim, run the panel, stream progress as SSE.
async function handleRun(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  let evidence: string;
  try {
    evidence = loadEvidence(JSON.parse((await readBody(req)) || "{}"));
  } catch (e) {
    return json(res, 400, { error: (e as Error).message });
  }

  res.writeHead(200, corsHeaders({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  }));
  const send = (obj: unknown) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
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
    res.end();
  }
}

// POST /claim/submit { asset, evidenceUrl } -> register a claim on-chain.
async function handleSubmit(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  let asset: string | undefined;
  let evidenceUrl: string | undefined;
  try {
    ({ asset, evidenceUrl } = JSON.parse((await readBody(req)) || "{}"));
  } catch {
    return json(res, 400, { error: "invalid JSON body" });
  }
  if (!asset || !evidenceUrl) return json(res, 400, { error: "asset and evidenceUrl are required" });

  let text: string;
  try {
    const r = await fetch(evidenceUrl);
    if (!r.ok) throw new Error(`evidence URL returned ${r.status}`);
    text = await r.text();
  } catch (e) {
    return json(res, 400, { error: `couldn't fetch the evidence URL: ${(e as Error).message}` });
  }
  try {
    JSON.parse(text);
  } catch {
    return json(res, 400, { error: "the evidence URL must serve JSON" });
  }

  try {
    const hash = crypto.createHash("sha256").update(text).digest("hex");
    const tx = await openClaimWithEvidence(asset, evidenceUrl, hash);
    const info = await confirm(tx);
    const claimId = claimIdFromOpen(info);
    return json(res, 200, { claimId, tx });
  } catch (e) {
    return json(res, 500, { error: (e as Error).message ?? "failed to register claim" });
  }
}

// The bridge runs here so Casper writes get their CSPR.cloud header on localhost.
startProxy();

const server = http.createServer((req, res) => {
  const url = req.url ?? "";
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders());
    return res.end();
  }
  if (req.method === "GET" && url.startsWith("/health")) return json(res, 200, { ok: true });
  if (req.method === "POST" && url.startsWith("/claim/run")) return void handleRun(req, res);
  if (req.method === "POST" && url.startsWith("/claim/submit")) return void handleSubmit(req, res);
  return json(res, 404, { error: "not found" });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`orchestrator service: http://0.0.0.0:${PORT} (/claim/run, /claim/submit, /health)`);
});
