// One-time setup: give each facet judge its own Casper identity so the Tribunal
// contract tracks reputation per judge (not all under one deployer key). For each
// facet it generates a key, funds it from the deployer account (no faucet needed),
// and registers it on the contract. Idempotent: skips already-funded keys and
// re-registering is a contract no-op. Run from the orchestrator dir:
//   npx tsx scripts/setup-judge-keys.mjs
import C from "casper-js-sdk";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { config } from "../src/config.ts";

const FACETS = ["authenticity", "solvency", "custodian", "valuation"];
const KEYDIR = "../.keys/casper/judges";
const FUND_MOTES = "50000000000"; // 50 CSPR each
const rpc = new C.RpcClient(new C.HttpHandler(config.casperNodeUrl));
const deployer = C.PrivateKey.fromPem(readFileSync(config.casperSecretKeyPath, "utf8"), C.KeyAlgorithm.ED25519);
const pkgHex = config.tribunalContractHash.replace(/^hash-/, "");

async function waitOk(hash, label) {
  for (let i = 0; i < 30; i++) {
    try {
      const r = await rpc.getTransactionByTransactionHash(hash);
      const info = r?.executionInfo?.executionResult;
      if (info) {
        if (info.errorMessage) throw new Error(`${label} reverted: ${info.errorMessage}`);
        return;
      }
    } catch (e) { if (String(e).includes("reverted")) throw e; }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`${label} not processed`);
}

async function balanceMotes(pub) {
  const res = await fetch(config.casperNodeUrl, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "query_balance",
      params: { purse_identifier: { main_purse_under_public_key: pub.toHex() } } }),
  });
  const j = await res.json();
  return j?.result?.balance ? BigInt(j.result.balance) : -1n;
}

mkdirSync(KEYDIR, { recursive: true });

for (const facet of FACETS) {
  const path = `${KEYDIR}/${facet}.pem`;
  if (!existsSync(path)) {
    const k = C.PrivateKey.generate(C.KeyAlgorithm.ED25519);
    writeFileSync(path, k.toPem(), { mode: 0o600 });
    console.log(`[${facet}] generated key`);
  }
  const key = C.PrivateKey.fromPem(readFileSync(path, "utf8"), C.KeyAlgorithm.ED25519);
  const pub = key.publicKey;
  console.log(`[${facet}] pubkey ${pub.toHex()}`);

  const bal = await balanceMotes(pub);
  if (bal <= 0n) {
    const tx = new C.NativeTransferBuilder()
      .from(deployer.publicKey).target(pub).amount(FUND_MOTES)
      .id(Date.now() % 1_000_000).chainName(config.casperNetwork).payment(100_000_000).build();
    tx.sign(deployer);
    const res = await rpc.putTransaction(tx);
    const h = res.transactionHash.toHex?.() ?? String(res.transactionHash);
    console.log(`[${facet}] funding tx ${h}`);
    await waitOk(h, `${facet} fund`);
    console.log(`[${facet}] funded 50 CSPR`);
  } else {
    console.log(`[${facet}] already funded (${bal / 1_000_000_000n} CSPR)`);
  }

  const ah = pub.accountHash();
  const args = C.Args.fromMap({ judge: C.CLValue.newCLKey(C.Key.newKey(ah.toPrefixedString())) });
  const tx = new C.ContractCallBuilder()
    .byPackageHash(pkgHex).entryPoint("register_judge").runtimeArgs(args)
    .from(deployer.publicKey).chainName(config.casperNetwork).payment(6_000_000_000).build();
  tx.sign(deployer);
  const res = await rpc.putTransaction(tx);
  const h = res.transactionHash.toHex?.() ?? String(res.transactionHash);
  console.log(`[${facet}] register tx ${h}`);
  await waitOk(h, `${facet} register`);
  console.log(`[${facet}] registered\n`);
}
console.log("done: 4 judges funded + registered");
