// Tribunal relay CLI.
//   open                              -> open a new claim on Casper (note the sequential id)
//   relay <claimId> <evidence>        -> run the full panel (all configured judges) and finalize
//   relay-facet <facet> <id> <ev>     -> run one named facet (authenticity|solvency|custodian|valuation)
import { readFileSync } from "node:fs";
import { openClaim } from "./casper.js";
import { relayPanel, relayFacet } from "./orchestrate.js";

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
} else {
  console.error("usage: tsx src/cli.ts open | relay <claimId> <evidence.json> | relay-facet <facet> <claimId> <evidence.json>");
  process.exit(1);
}
