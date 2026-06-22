// Give each facet judge its own GenLayer account, so the four judges can run
// concurrently instead of sharing one account's nonce (which forced them to run
// one after another). On studionet, fresh accounts can transact without funding,
// so this just generates a key per facet. Idempotent: won't overwrite existing keys.
//   npx tsx scripts/setup-genlayer-judges.mjs
import { generatePrivateKey, createAccount } from "genlayer-js";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, "..", "..", ".keys", "genlayer", "judges");
mkdirSync(dir, { recursive: true });

const FACETS = ["authenticity", "solvency", "custodian", "valuation"];
for (const facet of FACETS) {
  const path = join(dir, `${facet}.key`);
  let pk;
  if (existsSync(path)) {
    pk = readFileSync(path, "utf8").trim();
    console.log(`[${facet}] key exists -> ${createAccount(pk).address}`);
  } else {
    pk = generatePrivateKey();
    writeFileSync(path, pk.trim() + "\n", { mode: 0o600 });
    console.log(`[${facet}] generated -> ${createAccount(pk).address}`);
  }
}
console.log("done: 4 judge GenLayer accounts ready (no funding needed on studionet)");
