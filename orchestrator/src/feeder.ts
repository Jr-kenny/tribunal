// The feeder: the autonomous discovery loop. It no longer reads a hardcoded list
// of claims. Instead it drives the Scout, a GenLayer contract that scrapes live
// real-world-asset sources (RWA news, proof-of-reserves feeds, registries) UNDER
// CONSENSUS and frames what it finds into claims. The feeder then files each new
// discovery onto the Casper registry, where the watcher judges it. The sources to
// scan are listed in scout-sources.json; what gets discovered is whatever those
// sources actually serve at scan time, agreed by the GenLayer validators.
//
// Run (proxy up, from orchestrator/):  npx tsx src/feeder.ts

import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { readClaimEvents } from "./events.js";
import { openClaimWithEvidence } from "./casper.js";
import { confirm, claimIdFromOpen } from "./chainread.js";
import { scoutScan, scoutListDiscoveries } from "./genlayer.js";

// Search for new claims hourly by default (override with FEEDER_POLL_MS, in ms).
const POLL_MS = Number(process.env.FEEDER_POLL_MS ?? 3_600_000);

interface Source {
  url: string;
  kind: string; // "rwa-news" | "proof-of-reserves" | "carbon-registry" | "casper-tokens" | ...
  maxItems?: number;
}

function sources(): Source[] {
  return JSON.parse(readFileSync("./scout-sources.json", "utf8"));
}

// The public URL the watcher (and anyone) can fetch a discovery's framed evidence
// from, served by the /scout/evidence route off the scout's own on-chain record.
function evidenceUri(key: string): string {
  return `${config.scoutEvidenceBase.replace(/\/$/, "")}/scout/evidence/${encodeURIComponent(key)}`;
}

async function tick(): Promise<void> {
  const scout = config.genlayerScout;
  if (!scout) {
    console.log("[feeder] no Scout configured (set GENLAYER_SCOUT); skipping discovery");
    return;
  }

  // 1. Scrape every configured RWA source under consensus.
  for (const src of sources()) {
    try {
      console.log(`[feeder] scouting ${src.kind} source ${src.url} under consensus...`);
      const tx = await scoutScan(scout, src.url, src.kind, src.maxItems ?? 5);
      console.log(`[feeder] scout scan accepted (tx ${tx})`);
    } catch (e) {
      console.log(`[feeder] scout couldn't scan ${src.url}: ${(e as Error).message}`);
    }
  }

  // 2. Read what the scout has discovered, and which claims are already filed.
  let discoveries;
  let already: Set<string>;
  try {
    discoveries = await scoutListDiscoveries(scout);
    already = new Set((await readClaimEvents()).map((c) => c.evidenceUri).filter(Boolean) as string[]);
  } catch (e) {
    console.log(`[feeder] couldn't read discoveries/registry: ${(e as Error).message}`);
    return;
  }

  // 3. File each new discovery onto the Casper registry. The evidence committed is
  //    the scout's consensus-derived framing, hashed so the watcher can verify it.
  for (const d of discoveries) {
    const uri = evidenceUri(d.key);
    if (already.has(uri)) continue; // already filed this discovery
    try {
      const hash = crypto.createHash("sha256").update(d.evidence).digest("hex");
      const tx = await openClaimWithEvidence(d.asset, uri, hash);
      const info = await confirm(tx);
      console.log(`[feeder] filed discovery "${d.asset}" as claim ${claimIdFromOpen(info)} (${d.key})`);
    } catch (e) {
      console.log(`[feeder] couldn't file "${d.asset}" (${d.key}): ${(e as Error).message}`);
    }
  }
}

// Start the feeder loop. Called directly as a CLI, or in-process by the server
// (RUN_FEEDER=1) so discovery runs without a separate host.
export async function startFeeder(): Promise<void> {
  console.log(`[feeder] scouting ${sources().length} RWA source(s) under consensus (every ${POLL_MS / 1000}s).`);
  await tick();
  setInterval(tick, POLL_MS);
}

// Run standalone when invoked directly, but not when imported by the server.
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  startFeeder();
}
