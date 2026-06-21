// Mint the tribunal's own GenLayer account. Writes the private key to
// .keys/genlayer/deployer.key (chmod 600, gitignored) and prints the address
// so you can fund it from the faucet. Won't clobber an existing key.
import { generatePrivateKey, createAccount } from "genlayer-js";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, "..", "..", ".keys", "genlayer");
const path = join(dir, "deployer.key");

if (existsSync(path)) {
  console.error(`Key already exists at ${path}, refusing to overwrite.`);
  process.exit(1);
}

mkdirSync(dir, { recursive: true });
const pk = generatePrivateKey();
writeFileSync(path, pk.trim() + "\n", { mode: 0o600 });

console.log(`address: ${createAccount(pk).address}`);
console.log(`key written to ${path}`);
console.log("fund it at the GenLayer faucet, then run the relay.");
