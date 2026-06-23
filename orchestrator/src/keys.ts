// Key resolution that works both locally and in the cloud.
//
// Locally the keys live in gitignored files under .keys/, and the env vars hold
// a *path* to them (CASPER_SECRET_KEY=../.keys/casper/secret_key.pem). A host
// like Vercel/Render has no filesystem for those, so the same env var instead
// holds the key's *contents*. Each lookup accepts either: if the value looks
// like key material it's used directly, otherwise it's treated as a file path.
// That keeps the app's existing var names (CASPER_SECRET_KEY,
// GENLAYER_DEPLOYER_KEY) and the local path-based .env untouched.
//
// The four per-judge keys had no env vars before (they were always read from
// hardcoded .keys/ paths). They get one var each so they can be supplied in the
// cloud, falling back to the same .keys/ path locally:
//   CASPER_JUDGE_{AUTHENTICITY,SOLVENCY,CUSTODIAN,VALUATION}   (path or ED25519 PEM)
//   GENLAYER_JUDGE_{AUTHENTICITY,SOLVENCY,CUSTODIAN,VALUATION} (path or 0x… hex)

import { readFileSync, existsSync } from "node:fs";
import { config } from "./config.js";

// An env value is the key material itself if it carries a PEM header or a 0x
// hex prefix; otherwise it's a path to the file holding it. Env vars often carry
// PEM newlines escaped as \n, so restore them.
function looksLikeKeyMaterial(v: string): boolean {
  const t = v.trim();
  return t.startsWith("-----BEGIN") || t.includes("-----BEGIN") || /^0x[0-9a-fA-F]/.test(t);
}

function resolve(envValue: string | undefined, fallbackPath: string | undefined, label: string): string {
  const v = envValue?.trim();
  if (v && looksLikeKeyMaterial(v)) return v.replace(/\\n/g, "\n");
  // env var holds a path (local), or is unset and we fall back to the .keys/ path
  const p = v && v.length ? v : fallbackPath;
  if (p && existsSync(p)) return readFileSync(p, "utf8");
  throw new Error(`missing key: ${label} (set its env var to the key contents, or a readable path; tried "${p ?? "(none)"}")`);
}

/** Casper ED25519 PEM for a facet judge ("authenticity"…"valuation") or "deployer". */
export function casperKeyPem(id: string): string {
  if (id === "deployer") return resolve(process.env.CASPER_SECRET_KEY, undefined, "CASPER_SECRET_KEY");
  const env = `CASPER_JUDGE_${id.toUpperCase()}`;
  return resolve(process.env[env], `../.keys/casper/judges/${id}.pem`, env);
}

/** GenLayer raw private key (0x…) for a facet judge or "deployer". */
export function genlayerKeyValue(id: string): string {
  if (id === "deployer") return resolve(process.env.GENLAYER_DEPLOYER_KEY, undefined, "GENLAYER_DEPLOYER_KEY").trim();
  const env = `GENLAYER_JUDGE_${id.toUpperCase()}`;
  return resolve(process.env[env], `../.keys/genlayer/judges/${id}.key`, env).trim();
}
