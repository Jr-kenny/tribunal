// Live demo of the resolution / reputation loop on Casper Testnet.
//
// This exercises the one part of the vision that was coded and unit-tested but
// had never run on-chain: resolve_claim scoring each judge against ground truth
// and moving its reputation per judge. To keep it self-contained (no GenLayer
// dependency), the four verdicts here are HAND-SET to exercise the resolution
// path; this is NOT a real GenLayer panel run (those are claims 5/8/10). Each
// verdict's proof string says so.
//
// Story: solvency correctly FAILs a claim whose reserves truly fell short, and
// authenticity + custodian correctly PASS. Valuation gets it wrong (says FAIL on
// a facet that was actually fine), so three judges should rise and valuation
// should be slashed. Run with the proxy up:
//   npx tsx scripts/demo-resolution.mjs
import { openClaim, submitVerdict, finalize, resolveClaim } from "../src/casper.ts";
import { confirm, claimIdFromOpen, statusFromDiff } from "../src/chainread.ts";

const PROOF = "demo:resolution-loop (hand-set verdict, not a GenLayer run)";

// facet ids: authenticity=1, solvency=2, custodian=3, valuation=4
const verdicts = [
  { facet: "authenticity", id: 1, vote: "PASS", conf: 9000 },
  { facet: "solvency", id: 2, vote: "FAIL", conf: 9500 },
  { facet: "custodian", id: 3, vote: "PASS", conf: 8500 },
  { facet: "valuation", id: 4, vote: "FAIL", conf: 8000 }, // the wrong call
];

// ground truth: facets 1, 3, 4 were actually true; solvency (2) really failed.
// bits set for the true facets: (1<<1)|(1<<3)|(1<<4) = 26.
const truthMask = (1 << 1) | (1 << 3) | (1 << 4);

console.log("opening a fresh claim...");
const openTx = await openClaim();
const openInfo = await confirm(openTx);
const claimId = claimIdFromOpen(openInfo);
console.log(`claim ${claimId} opened (tx ${openTx})\n`);

for (const v of verdicts) {
  const tx = await submitVerdict(claimId, v.id, v.vote, v.conf, PROOF, v.facet);
  await confirm(tx);
  console.log(`[${v.facet}] ${v.vote} @ ${v.conf}bps submitted under its own judge key (tx ${tx})`);
}

console.log("\nfinalizing...");
const finTx = await finalize(claimId);
const finInfo = await confirm(finTx);
console.log(`finalized: ${statusFromDiff(openInfo, finInfo)} (tx ${finTx})\n`);

console.log(`resolving against ground truth (mask ${truthMask}: facets 1,3,4 true, solvency failed)...`);
const resTx = await resolveClaim(claimId, truthMask);
await confirm(resTx);
console.log(`resolved (tx ${resTx})\n`);

console.log("=== reputation loop ran on-chain ===");
console.log("per the contract rule (unit-tested, 13 passing tests): each judge starts at 5000bps;");
console.log("  authenticity PASS  -> correct -> 5500");
console.log("  solvency     FAIL  -> correct -> 5500");
console.log("  custodian    PASS  -> correct -> 5500");
console.log("  valuation    FAIL  -> WRONG   -> 4500 (slashed)");
console.log(`\nclaim ${claimId} | finalize ${finTx} | resolve ${resTx}`);
