// The feeder: the third intake door, automated. It watches a configured set of
// claim sources and files any new one onto the registry on its own; the watcher
// then judges it. This is the honest, source-list version of the bigger vision
// (a GenLayer-backed agent that scans the open web / the Casper ecosystem for
// claim-like activity and frames it). The framing here is the generic decomposer
// on the judge side, so a filed source becomes a fully judged registry entry.
//
// Run (proxy up, from orchestrator/):  npx tsx src/feeder.ts

import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readClaimEvents } from "./events.js";
import { openClaimWithEvidence } from "./casper.js";
import { confirm, claimIdFromOpen } from "./chainread.js";

const POLL_MS = Number(process.env.FEEDER_POLL_MS ?? 60000);

interface Source {
  asset: string;
  url: string;
}

function sources(): Source[] {
  return JSON.parse(readFileSync("./feeder-sources.json", "utf8"));
}

async function tick(): Promise<void> {
  let already: Set<string>;
  try {
    already = new Set((await readClaimEvents()).map((c) => c.evidenceUri).filter(Boolean) as string[]);
  } catch (e) {
    console.log(`[feeder] couldn't read the registry: ${(e as Error).message}`);
    return;
  }

  for (const src of sources()) {
    if (already.has(src.url)) continue; // already filed
    try {
      const res = await fetch(src.url);
      if (!res.ok) throw new Error(`source returned ${res.status}`);
      const text = await res.text();
      const hash = crypto.createHash("sha256").update(text).digest("hex");
      const tx = await openClaimWithEvidence(src.asset, src.url, hash);
      const info = await confirm(tx);
      console.log(`[feeder] filed "${src.asset}" as claim ${claimIdFromOpen(info)} (${src.url})`);
    } catch (e) {
      console.log(`[feeder] couldn't file ${src.url}: ${(e as Error).message}`);
    }
  }
}

// Start the feeder loop. Called directly as a CLI, or in-process by the server
// (RUN_FEEDER=1) so sources are filed onto the registry without a separate host.
export async function startFeeder(): Promise<void> {
  console.log(`[feeder] watching ${sources().length} source(s) for new claims (every ${POLL_MS / 1000}s).`);
  await tick();
  setInterval(tick, POLL_MS);
}

// Run standalone when invoked directly, but not when imported by the server.
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  startFeeder();
}
