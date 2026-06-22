# Tribunal live RWA claim registry + autonomous watcher

Date: 2026-06-22
Author: Kenny (jr-kenny)

## What we're building

Turn Tribunal from an on-demand verifier into a standing, public on-chain
**registry of real-world-asset claims and the panel's verdict on each**, fed by a
permissionless intake and judged autonomously by a watcher. Anyone can browse the
registry ("here are the RWA claims and what the tribunal ruled"), anyone can add a
claim, and the panel reacts on its own.

The Casper contract is the registry. Events are the backbone. The watcher is the
engine. The intake has two doors. The GenLayer judges and the relay logic do not
change.

## The shape

```
registry (the browsable thing)
  ← events (ClaimOpened / ClaimFinalized, read via CSPR.cloud)
    ← intake (two doors: direct contract call, or the website form)
    ← watcher (reacts to ClaimOpened, runs the panel, finalizes)
```

## Components

### 1. Contract changes (additive, the only thing that changes)

- `open_claim_with_evidence(asset: String, evidence_uri: String, evidence_hash: String) -> u64`
  stores the claim's metadata and emits `ClaimOpened { claim_id, asset, evidence_uri, evidence_hash, submitter }`.
- `finalize` additionally emits `ClaimFinalized { claim_id, status, score }`.
- Keep the existing `open_claim` untouched (the dashboard's live-run path still uses it with off-chain evidence).
- Add a view `get_claim_meta(claim_id) -> (asset, evidence_uri, evidence_hash)` for convenience; the registry primarily reads events, so this is a nicety, not load-bearing.
- Events declared with `#[odra::event]`.
- Everything else (federation, reputation, resolve) is unchanged.

**Deployment + the reputation-state cost.** Adding entry points/events means a new
contract version. First attempt an in-place Odra upgrade to preserve the existing
reputation state; if a clean upgrade isn't available, redeploy and re-seed:
re-register the four judges (back to 5000) and run one `resolve_claim` to restore
the divergence, then update `DEPLOYMENTS.md`, the README, `.env`, and regenerate
`judge-rep-map.ts` via `build-rep-map.mjs`. This is the one real cost and it's
accepted. Because the registry reads the new events, this change is foundational
and comes first.

### 2. Events as the backbone

Both the watcher and the registry page read the contract's event log through
CSPR.cloud's contract-events API (we already use CSPR.cloud for reads). The events
carry everything needed (asset, evidence pointer, status, score), so no Odra
storage-decoding is required for the listing.

### 3. The watcher (`orchestrator/src/watcher.ts`)

A standalone long-running service that reuses the existing relay:

- Polls CSPR.cloud for `ClaimOpened` events since a persisted cursor (last-processed claim id / block).
- For each new claim: fetch `evidence_uri`, verify it hashes to `evidence_hash` (reject + log on mismatch), then run `relayPanel` (the parallel judges) and finalize.
- Dedup/idempotency: skip any claim whose on-chain status is already non-Open; persist the cursor so a restart never re-judges.
- Hostable on Render (with an UptimeRobot keep-alive) for true 24/7 autonomy, or run locally during a demo. This is the only always-on piece.

### 4. Intake, the two doors

- **Direct (permissionless):** anyone calls `open_claim_with_evidence` from any wallet/script, pointing at a publicly hosted evidence JSON (same shape as the example claims). The watcher picks it up.
- **Website:** a "Submit to the registry" form that takes the asset name and a public evidence URL (same JSON shape as the example claims). The route fetches that URL to compute its hash, then calls `open_claim_with_evidence` with the asset, URL, and hash. No server-side file hosting is needed (which also keeps it Vercel-friendly); hosting the JSON on the user's behalf is a later convenience, out of scope now.

### 5. The Registry page (frontend, read-only)

A new `/registry` page lists every claim from the event log: asset, status
(Backed / Disputed / NotBacked / Open/pending), score, when, submitter, with a
drill-in to the per-facet breakdown. Pure read, no keys, works on Vercel exactly
like the reputation board.

### 6. GenLayer judges

Unchanged. The watcher drives them identically to the dashboard.

## Data flow

1. A claim is registered (direct call or via the site) → `ClaimOpened` event.
2. The watcher sees the event → fetches + verifies the evidence → runs the four judges in parallel → submits verdicts → `finalize` → `ClaimFinalized` event.
3. The Registry page and reputation board read the events/chain to display the live state.

## Error handling

- Evidence hash mismatch: the watcher refuses to judge and logs it; the claim stays Open (a future "rejected" status could surface this, out of scope now).
- Evidence fetch failure: retry, then skip and leave for a later pass.
- A single judge failing mid-panel is already tolerated (the parallel run uses `allSettled`); the claim still finalizes on the judges that completed.
- Watcher restart: the persisted cursor + the non-Open skip prevent double-judging.

## Testing

- Contract: HostEnv tests that `open_claim_with_evidence` stores metadata and that open/finalize emit the events with the right fields.
- Watcher: unit-test the cursor + dedup logic against a mocked event source (no live chain).
- Registry: a thin events client tested against a mocked CSPR.cloud response.
- Manual: register a claim through the site, watch the watcher auto-judge it, see it appear finalized in the registry.

## Sequencing (for the plan)

1. Contract: add the evidence entry point + events, HostEnv tests, deploy (upgrade or redeploy + re-seed).
2. Events client + Registry read page (read-only, shippable on its own).
3. Watcher service (autonomous judging).
4. Website intake form (+ evidence hosting route).

## Out of scope (now)

- An automatic external "news"/data feed that auto-creates claims from public RWA sources (a future feeder; the registry fills from submissions for now).
- Spam / sybil controls beyond what testnet needs.
- A "rejected" claim status for hash mismatches (logged for now).
