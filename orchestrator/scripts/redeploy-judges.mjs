// Redeploy the four GenLayer FacetJudges after a contract change (e.g. adding
// judge_with_rubric). GenLayer contracts are immutable, so an update means a fresh
// deploy at a new address. The Casper-side judge identities/reputation are keyed by
// their Casper keys and are NOT affected. Prints the new addresses to put in .env.
//   npx tsx scripts/redeploy-judges.mjs
import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import { readFileSync } from "node:fs";
import "dotenv/config";

const code = readFileSync("../judges/facet_judge.py", "utf8");
const rubrics = JSON.parse(readFileSync("/tmp/rubrics.json", "utf8"));
const account = createAccount(readFileSync(process.env.GENLAYER_DEPLOYER_KEY, "utf8").trim());
const client = createClient({ chain: studionet, account });

const ENV = {
  authenticity: "GENLAYER_AUTHENTICITY_JUDGE",
  solvency: "GENLAYER_SOLVENCY_JUDGE",
  custodian: "GENLAYER_CUSTODIAN_JUDGE",
  valuation: "GENLAYER_VALUATION_JUDGE",
};

async function withRetry(label, fn, tries = 5) {
  let last;
  for (let i = 1; i <= tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const transient = /fetch failed|timeout|ECONN|ETIMEDOUT|UND_ERR|socket|network|execution failed/i.test(
        `${e?.message ?? ""} ${JSON.stringify(e)?.slice(0, 300)}`,
      );
      if (!transient || i === tries) throw e;
      console.log(`  [retry] ${label}: ${i}/${tries - 1} in ${2 * i}s`);
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
  throw last;
}

const out = {};
for (const facet of ["authenticity", "solvency", "custodian", "valuation"]) {
  const { facet_name, rubric } = rubrics[facet];
  console.log(`[${facet}] deploying...`);
  const txHash = await withRetry(`${facet} deploy`, () =>
    client.deployContract({ code, args: [facet_name, rubric], leaderOnly: false }),
  );
  const receipt = await withRetry(`${facet} receipt`, () =>
    client.waitForTransactionReceipt({ hash: txHash, status: TransactionStatus.ACCEPTED, interval: 5000, retries: 60 }),
  );
  const addr =
    receipt?.data?.contract_address ??
    receipt?.contract_address ??
    receipt?.data?.["contract_address"];
  out[facet] = addr;
  console.log(`[${facet}] -> ${addr}  (tx ${txHash})`);
}

console.log("\n# update orchestrator/.env with:");
for (const facet of Object.keys(ENV)) console.log(`${ENV[facet]}=${out[facet]}`);
