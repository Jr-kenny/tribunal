# Tribunal live RWA claim registry + autonomous watcher

Date: 2026-06-22
Author: Kenny (jr-kenny)

## What we're building

Turn Tribunal from an on-demand, treasury-only verifier into a standing, public
on-chain **registry of real-world-asset claims and the panel's verdict on each**,
fed by a permissionless intake (including an automated feeder), judged
autonomously, and able to handle claims beyond proof-of-reserves. Anyone can
browse the registry ("here are the claims and what the tribunal ruled"), anyone or
the feeder can add a claim, and the panel reacts on its own.

The Casper contract is the registry. Events are the backbone. The watcher is the
engine. The intake has three doors (direct call, website form, automated feeder).
The four judges become general verification checks, not treasury-specific ones.

## The shape

```
registry (the browsable thing)
  ← events (ClaimOpened / ClaimFinalized, read via CSPR.cloud)
    ← intake (three doors: direct contract call, website form, automated feeder)
    ← watcher (reacts to ClaimOpened, runs the panel, finalizes)
      ← four general checks, with per-claim questions written by the feeder/decomposer
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

### 4. Intake, the three doors

- **Direct (permissionless):** anyone calls `open_claim_with_evidence` from any wallet/script, pointing at a publicly hosted evidence JSON (same shape as the example claims). The watcher picks it up.
- **Website:** a "Submit to the registry" form that takes the asset name and a public evidence URL (same JSON shape as the example claims). The route fetches that URL to compute its hash, then calls `open_claim_with_evidence` with the asset, URL, and hash. No server-side file hosting is needed (which also keeps it Vercel-friendly).
- **Automated feeder:** a service that periodically scans configured sources and files claims on its own. Detailed in section 7.

### 5. The Registry page (frontend, read-only)

A new `/registry` page lists every claim from the event log: asset, status
(Backed / Disputed / NotBacked / Open/pending), score, when, submitter, with a
drill-in to the per-facet breakdown. Pure read, no keys, works on Vercel exactly
like the reputation board.

### 6. The four checks are general, not treasury-specific

The four judges stop being treasury fields and become four general dimensions of
verification that fit almost any claim:

- **Provenance** — is the underlying document/source genuine? (today's authenticity)
- **Core truth** — is the central factual claim actually true? (for treasury this is solvency reading the reserve; for another claim it's the heart of that claim)
- **Counterparty** — are the named people/entities real and legitimate? (today's custodian)
- **Consistency / valuation** — do the numbers and values hold up? (today's valuation)

The judge *mechanics* don't change (same contract, same four judge contracts, same
parallel run). What changes is that each judge's question (rubric) is written
per-claim instead of hardcoded to treasury. For a treasury claim those four come
out exactly as today; for a different claim they come out phrased for that claim.
Each judge still owns a distinct dimension, so no two judges do the same work, and
reputation keeps meaning ("good at provenance checks" across all claim types).

"Core truth" is the default critical (veto) dimension, the way solvency is for
treasury. Trust varies with evidence: a treasury core-truth check gets the exact
on-chain reserve read; an arbitrary claim's core-truth check leans on the generic
web read, so the panel honestly returns lower confidence when evidence is softer.

### 7. The automated feeder (the third door)

A service (off-chain, optionally backed by GenLayer web-reads under consensus, so
the discovery itself is trust-minimized) that:

1. **Scans** configured sources on an interval (e.g. the last hour of activity in the Casper ecosystem / a set of feeds) for things that look like verifiable claims.
2. **Frames** each candidate into the four general checks (writes provenance / core-truth / counterparty / consistency questions for it) and points each at its evidence. This framing is stored on-chain with the claim, so what was asked is always auditable, not a black box.
3. **Two-stage on ambiguity:** clear candidates are filed straight away; ambiguous ones trigger a deeper research pass (pull more detail) before filing, or are dropped if they can't be made into a real claim.
4. **Files** the framed claim via `open_claim_with_evidence`, after which the watcher and judges take over.

Crucially, **the feeder doesn't need to be perfect, because the judges are the
backstop.** It only frames and files; the panel independently verifies. A sloppy
or manipulated framing can at worst produce an UNCERTAIN/FAIL, never a false
BACKED, so the system fails soft. The feeder needs no special identity (anonymous
or its own key, either works). At volume it should throttle; the ambiguity gate
already filters a lot of noise.

## Data flow

1. A claim is registered, by a person (direct call or site form) or by the feeder (which scans, frames it into the four checks, researches if ambiguous, then files) → `ClaimOpened` event carrying the framing.
2. The watcher sees the event → fetches + verifies the evidence → runs the four judges in parallel, each on its own dimension's question → submits verdicts → `finalize` → `ClaimFinalized` event.
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

Each slice ships on its own; the order keeps risk and dependencies sane (it is not
a statement about how long any of it takes).

1. Contract: add the evidence entry point + events, HostEnv tests, deploy (upgrade or redeploy + re-seed). Concrete consequence: a redeploy resets the reputation board, so we re-seed it as part of this step.
2. Events client + Registry read page (read-only, shippable on its own).
3. Watcher service (autonomous judging of registered claims).
4. Website intake form.
5. Generalize the questions: the per-claim decomposer writes the four checks' rubrics, proven by judging one clearly non-treasury claim end to end.
6. Automated feeder (scan → frame → research-if-ambiguous → file), building on the decomposer from step 5.

## Out of scope (now)

- A specific curated source list for the feeder is chosen at build time (the feeder is source-agnostic; pointing it at good sources is config, not architecture).
- Spam / sybil controls beyond what testnet needs.
- A "rejected" claim status for hash mismatches (logged for now).
- Hosting a submitter's evidence JSON on their behalf (the site takes a public URL for now).
