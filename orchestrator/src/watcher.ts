// The autonomous watcher: the engine behind the registry.
//
// It polls the Casper event log for claims that have been registered
// (ClaimOpened) but not yet judged (status still Open), fetches each claim's
// evidence from its URL, verifies the evidence hashes to what the claim committed
// on-chain, then runs the full panel and finalizes, all with no human. Once a
// claim finalizes its status is no longer Open, so it is never judged twice.
//
// Run (proxy up, from orchestrator/):  npx tsx src/watcher.ts

import crypto from "node:crypto";
import { readClaimEvents, type ClaimRecord } from "./events.js";
import { relayPanel } from "./orchestrate.js";

const POLL_MS = Number(process.env.WATCHER_POLL_MS ?? 15000);

// claims currently being judged this run, so a slow judge run isn't picked up
// again by the next poll before it finalizes
const inFlight = new Set<number>();
let busy = false;

async function judgeClaim(c: ClaimRecord): Promise<void> {
  if (!c.evidenceUri) return;
  console.log(`\n[watcher] new claim ${c.claimId} "${c.asset ?? "(untitled)"}" -> fetching evidence`);

  let text: string;
  try {
    const res = await fetch(c.evidenceUri);
    if (!res.ok) throw new Error(`evidence fetch ${res.status}`);
    text = await res.text();
  } catch (e) {
    console.log(`[watcher] claim ${c.claimId}: couldn't fetch evidence (${(e as Error).message}); will retry next pass`);
    return;
  }

  // integrity: the evidence must hash to what the claim committed on-chain
  const hash = crypto.createHash("sha256").update(text).digest("hex");
  if (c.evidenceHash && hash.toLowerCase() !== c.evidenceHash.toLowerCase()) {
    console.log(`[watcher] claim ${c.claimId}: evidence hash mismatch (committed ${c.evidenceHash.slice(0, 10)}…, got ${hash.slice(0, 10)}…); refusing to judge`);
    return;
  }

  console.log(`[watcher] claim ${c.claimId}: evidence verified, running the panel...`);
  const result = await relayPanel(c.claimId, text, (e) =>
    console.log(`  [claim ${c.claimId}] ${e.type}${"facet" in e ? " " + e.facet : ""}${"vote" in e ? " " + e.vote : ""}${"status" in e && e.status ? " " + e.status : ""}`),
  );
  console.log(`[watcher] claim ${c.claimId} finalized (tx ${result.finalizeTx}).`);
}

async function tick(): Promise<void> {
  if (busy) return; // a previous pass is still judging; judges share keys, so stay sequential
  busy = true;
  try {
    const claims = await readClaimEvents();
    const pending = claims.filter((c) => c.status === "Open" && c.evidenceUri && !inFlight.has(c.claimId));
    for (const c of pending) {
      inFlight.add(c.claimId);
      try {
        await judgeClaim(c);
      } catch (e) {
        console.log(`[watcher] claim ${c.claimId} failed: ${(e as Error).message}`);
      } finally {
        inFlight.delete(c.claimId);
      }
    }
  } catch (e) {
    console.log(`[watcher] poll error: ${(e as Error).message}`);
  } finally {
    busy = false;
  }
}

async function main(): Promise<void> {
  console.log(`[watcher] watching the registry for new claims (every ${POLL_MS / 1000}s). Ctrl-C to stop.`);
  await tick();
  setInterval(tick, POLL_MS);
}

main();
