// Deploy the Scout discovery contract to GenLayer. The Scout scrapes live RWA
// sources under consensus and frames the backing claims it finds; the feeder then
// files them onto the Casper registry. Prints the address to put in .env as
// GENLAYER_SCOUT.
//   npx tsx scripts/deploy-scout.mjs
import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import { readFileSync } from "node:fs";
import "dotenv/config";

const code = readFileSync("../judges/scout.py", "utf8");
const account = createAccount(readFileSync(process.env.GENLAYER_DEPLOYER_KEY, "utf8").trim());
const client = createClient({ chain: studionet, account });

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

console.log("[scout] deploying...");
const txHash = await withRetry("scout deploy", () => client.deployContract({ code, args: [], leaderOnly: false }));
const receipt = await withRetry("scout receipt", () =>
  client.waitForTransactionReceipt({ hash: txHash, status: TransactionStatus.ACCEPTED, interval: 5000, retries: 60 }),
);
const addr = receipt?.data?.contract_address ?? receipt?.contract_address ?? receipt?.data?.["contract_address"];
console.log(`[scout] -> ${addr}  (tx ${txHash})`);
console.log(`\n# add to orchestrator/.env and the Render service:\nGENLAYER_SCOUT=${addr}`);
