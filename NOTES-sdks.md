# Off-chain SDK reference (captured 2026-06-21)

Installed: `casper-js-sdk` 5.0.12, `genlayer-js` 1.1.8. casper-js-sdk v5 is a
major rewrite from v2, so these are the v5 names confirmed from the package.

## casper-js-sdk v5 (orchestrator/src/casper.ts)

Relevant exports for calling the Tribunal contract:
- `RpcClient`, `HttpHandler` - connect to the node RPC.
- `PrivateKey`, `PublicKey`, `KeyAlgorithm` - load the ed25519 key from the PEM
  in `.keys/casper/secret_key.pem`.
- `ContractCallBuilder` - build a contract entry-point call (set contract hash,
  entry point name, args, payment, sign, then put via RpcClient).
- `Args`, `NamedArg`, and the `CLValue*` constructors for typed args:
  `CLValueUInt64`, `CLValueUInt8`, `CLValueString`, `CLValueBool`,
  `CLValueUInt32`, `CLValueUInt256`, etc.
- `ContractHash` / `ContractPackageHash` for the deployed contract identity.
- `CasperNetwork` - higher-level network helper (may simplify put + wait).
- Events/results: `RpcClient` query methods for reading contract state back
  (the Tribunal views: get_status, get_score, get_reputation, get_verdict).

Entry-point arg mapping for Tribunal (all integers are basis points u32 -> CLValueUInt32,
ids u64 -> CLValueUInt64, facet u8 -> CLValueUInt8, vote -> CLValueString or the
odra_type enum encoding, proof -> CLValueString):
- submit_verdict(claim_id u64, facet_id u8, vote, confidence u32, genlayer_proof String)
- finalize(claim_id u64)
- open_claim() -> u64
- resolve_claim(claim_id u64, truth_pass_mask u64)
- views: get_status(u64), get_score(u64), get_reputation(Address), get_verdict(u64,u8)

NOTE to confirm at wire-up: how odra_type enums (Vote) are encoded as a CL arg.
Likely a CLValueString of the variant name, or a small uint tag. Verify against
the schema cargo-odra emits (contract/wasm or the generated schema) before
finalizing the arg encoding.

## genlayer-js 1.1.8 (orchestrator/src/genlayer.ts)

- `createClient({ chain, ... })` - client for read/write to a GenLayer contract.
- `createAccount(privateKey)` / `generatePrivateKey()` - account from the
  existing GENLAYER_DEPLOYER_PRIVATE_KEY.
- `chains` - chain presets (studionet/testnet).
- Call the FacetJudge: write `judge(claim_id, evidence)`, wait for the receipt
  (gives the tx hash = the proof carried onto Casper), then read
  `get_verdict(claim_id)` (view) and JSON.parse the returned verdict string.

## Deploy paths

- GenLayer FacetJudge: deploy via the `genlayer` CLI (v0.39.0, already installed)
  or genlayer-js, once per facet with (facet_name, rubric) constructor args from
  judges/rubrics.py. Uses the existing GenLayer deployer key.
- Casper Tribunal: `cargo odra livenet ...` (confirm exact subcommand) using the
  ed25519 secret key at .keys/casper/secret_key.pem, against casper-test, after
  the faucet funds public key 016c7e59...cd5dc6.
