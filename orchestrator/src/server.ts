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
import { config } from "./config.js";
import { startProxy } from "./proxy.js";
import { startWatcher } from "./watcher.js";
import { startFeeder } from "./feeder.js";
import { openClaim, openClaimWithEvidence } from "./casper.js";
import { relayPanel } from "./orchestrate.js";
import { scoutGetDiscovery } from "./genlayer.js";
import { confirm, claimIdFromOpen, statusFromDiff } from "./chainread.js";

const PORT = Number(process.env.PORT ?? 8080);
// ALLOWED_ORIGIN is a comma-separated list of the site origins allowed to call
// this service (a project can serve several Vercel aliases). We echo back the
// caller's origin when it's on the list, which is what a browser's CORS check
// needs. "*" allows any origin.
const ALLOWED = (process.env.ALLOWED_ORIGIN ?? "*").split(",").map((s) => s.trim()).filter(Boolean);
const EXAMPLES_DIR = fileURLToPath(new URL("../examples/", import.meta.url));

function allowOrigin(req: http.IncomingMessage): string {
  if (ALLOWED.includes("*")) return "*";
  const origin = req.headers.origin;
  if (origin && ALLOWED.includes(origin)) return origin;
  return ALLOWED[0] ?? "*";
}

const EXAMPLES: Record<string, string> = {
  "claim-backed": "claim-backed.json",
  "claim-unbacked": "claim-unbacked.json",
  "claim-lying": "claim-lying.json",
};

function corsHeaders(req: http.IncomingMessage, extra: Record<string, string> = {}): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": allowOrigin(req),
    "Vary": "Origin",
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

function json(req: http.IncomingMessage, res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, corsHeaders(req, { "Content-Type": "application/json" }));
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
    return json(req, res, 400, { error: (e as Error).message });
  }

  res.writeHead(200, corsHeaders(req, {
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
    return json(req, res, 400, { error: "invalid JSON body" });
  }
  if (!asset || !evidenceUrl) return json(req, res, 400, { error: "asset and evidenceUrl are required" });

  let text: string;
  try {
    const r = await fetch(evidenceUrl);
    if (!r.ok) throw new Error(`evidence URL returned ${r.status}`);
    text = await r.text();
  } catch (e) {
    return json(req, res, 400, { error: `couldn't fetch the evidence URL: ${(e as Error).message}` });
  }
  try {
    JSON.parse(text);
  } catch {
    return json(req, res, 400, { error: "the evidence URL must serve JSON" });
  }

  try {
    const hash = crypto.createHash("sha256").update(text).digest("hex");
    const tx = await openClaimWithEvidence(asset, evidenceUrl, hash);
    const info = await confirm(tx);
    const claimId = claimIdFromOpen(info);
    return json(req, res, 200, { claimId, tx });
  } catch (e) {
    return json(req, res, 500, { error: (e as Error).message ?? "failed to register claim" });
  }
}

// GET /scout/evidence/<key> -> the framed evidence for a scout discovery, read
// straight off the scout's on-chain record. The feeder commits this URL + its
// hash as a claim's evidence, so the watcher fetches and verifies it here.
async function handleScoutEvidence(req: http.IncomingMessage, res: http.ServerResponse, key: string): Promise<void> {
  if (!config.genlayerScout) return json(req, res, 503, { error: "scout not configured" });
  try {
    const d = await scoutGetDiscovery(config.genlayerScout, key);
    if (!d) return json(req, res, 404, { error: "no such discovery" });
    // return the exact stored string so its sha256 matches what the feeder committed
    res.writeHead(200, corsHeaders(req, { "Content-Type": "application/json" }));
    res.end(d.evidence);
  } catch (e) {
    return json(req, res, 502, { error: (e as Error).message ?? "scout read failed" });
  }
}

// The bridge runs here so Casper writes get their CSPR.cloud header on localhost.
startProxy();

// Render's free tier has no background workers, so the autonomous loop runs in
// this same process when enabled: the feeder files claims from its sources, the
// watcher judges any registered-but-unjudged claim and finalizes it. Each judged
// claim spends real testnet CSPR + GenLayer + CSPR.cloud quota, so it's opt-in
// per env flag rather than always on.
if (process.env.RUN_FEEDER === "1") {
  startFeeder().catch((e) => console.error("[feeder] failed to start:", e));
}
if (process.env.RUN_WATCHER === "1") {
  startWatcher().catch((e) => console.error("[watcher] failed to start:", e));
}

const server = http.createServer((req, res) => {
  const url = req.url ?? "";
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders(req));
    return res.end();
  }
  if (req.method === "GET" && url.startsWith("/health")) return json(req, res, 200, { ok: true });
  if (req.method === "GET" && url.startsWith("/scout/evidence/")) {
    const key = decodeURIComponent(url.slice("/scout/evidence/".length).split("?")[0]);
    return void handleScoutEvidence(req, res, key);
  }
  if (req.method === "POST" && url.startsWith("/claim/run")) return void handleRun(req, res);
  if (req.method === "POST" && url.startsWith("/claim/submit")) return void handleSubmit(req, res);
  return json(req, res, 404, { error: "not found" });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`orchestrator service: http://0.0.0.0:${PORT} (/claim/run, /claim/submit, /health)`);
});
