// Tribunal relay CLI.
//   claim <evidence>                  -> open + run the full panel + read the final status, all from chain
//   open                              -> open a new claim on Casper (note the sequential id)
//   relay <claimId> <evidence>        -> run the full panel (all configured judges) and finalize
//   relay-facet <facet> <id> <ev>     -> run one named facet (authenticity|solvency|custodian|valuation)
import { readFileSync } from "node:fs";
import { openClaim, resolveClaim } from "./casper.js";
import { relayPanel, relayFacet } from "./orchestrate.js";
import { confirm, claimIdFromOpen, statusFromDiff } from "./chainread.js";

const cmd = process.argv[2];

if (cmd === "claim") {
  const evidencePath = process.argv[3];
  if (!evidencePath) {
    console.error("usage: tsx src/cli.ts claim <evidence.json>");
    process.exit(1);
  }
  const evidence = readFileSync(evidencePath, "utf8");
  const openTx = await openClaim();
  const openInfo = await confirm(openTx);
  const claimId = claimIdFromOpen(openInfo);
  console.log(`opened claim ${claimId} (tx ${openTx})\n`);

  const result = await relayPanel(claimId, evidence);
  for (const f of result.facets) await confirm(f.submitTx);
  const finalizeInfo = await confirm(result.finalizeTx);
  const status = statusFromDiff(openInfo, finalizeInfo);

  console.log("\n=== claim resolved ===");
  console.log(JSON.stringify({
    claimId,
    facets: result.facets.map((f) => ({ facet: f.facet, vote: f.vote, conf: f.confidence })),
    status,
    finalizeTx: result.finalizeTx,
  }, null, 2));
} else if (cmd === "open") {
  const tx = await openClaim();
  console.log("open_claim tx:", tx);
  console.log("note: claim ids are sequential; use the next unused id for `relay`.");
} else if (cmd === "relay") {
  const claimId = Number(process.argv[3]);
  const evidencePath = process.argv[4];
  if (!Number.isInteger(claimId) || !evidencePath) {
    console.error("usage: tsx src/cli.ts relay <claimId> <evidence.json>");
    process.exit(1);
  }
  const evidence = readFileSync(evidencePath, "utf8");
  const result = await relayPanel(claimId, evidence);
  console.log("\n=== panel complete ===");
  console.log(JSON.stringify(result, null, 2));
} else if (cmd === "relay-facet") {
  const facet = process.argv[3];
  const claimId = Number(process.argv[4]);
  const evidencePath = process.argv[5];
  if (!facet || !Number.isInteger(claimId) || !evidencePath) {
    console.error("usage: tsx src/cli.ts relay-facet <facet> <claimId> <evidence.json>");
    process.exit(1);
  }
  const evidence = readFileSync(evidencePath, "utf8");
  const result = await relayFacet(facet, claimId, evidence);
  console.log("\n=== relay complete ===");
  console.log(JSON.stringify(result, null, 2));
} else if (cmd === "resolve") {
  // resolve <claimId> <truthMask>: score each judge against ground truth, moving
  // reputation up for correct facet calls and down for wrong ones. The mask sets
  // bit `facet_id` for each facet that was actually true. For the proof-of-reserves
  // panel the facet ids are authenticity=1, solvency=2, custodian=3, valuation=4,
  // so a claim where only custodian + valuation were truly fine = (1<<3)|(1<<4) = 24.
  const claimId = Number(process.argv[3]);
  const truthMask = Number(process.argv[4]);
  if (!Number.isInteger(claimId) || !Number.isInteger(truthMask)) {
    console.error("usage: tsx src/cli.ts resolve <claimId> <truthMask>");
    console.error("  truthMask: bit per facet_id that was actually true (authenticity=1, solvency=2, custodian=3, valuation=4)");
    process.exit(1);
  }
  const tx = await resolveClaim(claimId, truthMask);
  console.log(`resolve_claim tx ${tx}`);
  await confirm(tx); // throws if it reverted
  console.log(`resolved claim ${claimId} on-chain (executed cleanly, no revert).`);
  console.log("each judge that called its facet correctly stepped its reputation up; each wrong call was slashed.");
} else {
  console.error("usage: tsx src/cli.ts claim <evidence.json> | open | relay <claimId> <evidence.json> | relay-facet <facet> <claimId> <evidence.json> | resolve <claimId> <truthMask>");
  process.exit(1);
}
