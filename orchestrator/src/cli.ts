// Tribunal relay CLI.
//   open                          -> open a new claim on Casper (note the sequential id)
//   relay <claimId> <evidence>    -> run the GenLayer solvency judge and commit its verdict
import { readFileSync } from "node:fs";
import { openClaim } from "./casper.js";
import { relaySolvency } from "./orchestrate.js";

const cmd = process.argv[2];

if (cmd === "open") {
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
  const result = await relaySolvency(claimId, evidence);
  console.log("\n=== relay complete ===");
  console.log(JSON.stringify(result, null, 2));
} else {
  console.error("usage: tsx src/cli.ts open | relay <claimId> <evidence.json>");
  process.exit(1);
}
