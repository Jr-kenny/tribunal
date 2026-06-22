# Tribunal UI design spec

Date: 2026-06-22
Author: Kenny (jr-kenny)

## What we're building

A real, multi-page web frontend for Tribunal, not a demo panel. It presents the
product (a multi-agent RWA verification oracle with on-chain reputation on
Casper), explains how it works, and lets a visitor actually run the panel against
the live Testnet contract and judges and watch the result settle on-chain.

Approved direction: dark, editorial "tribunal/court" aesthetic with a violet
signature accent and per-judge accent colors. Four pages: Landing, How it works,
Dashboard, Demo.

## Pages

1. **Landing (`/`).** Hero ("Don't trust the paperwork. Send in the panel."),
   the four-judge strip with each judge's one question, the Casper + GenLayer
   angle, a live-on-Testnet badge, and CTAs into Dashboard and Demo. Sections
   below the fold: the problem (RWA claims are taken on trust), the panel, the
   veto idea, the reputation idea, and a footer with the GitHub link.
2. **How it works (`/how-it-works`).** The architecture told visually: the three
   layers, the four judges and what each fetches under consensus, the two-pass
   federation rule (veto + reputation-weighted), and the reputation loop. Reuses
   the concepts from the README diagrams as real on-page sections.
3. **Dashboard (`/dashboard`).** The live surface. Pick or paste a claim, run the
   panel, watch the four judge cards fill in as each finishes (vote, confidence,
   one-line reason, GenLayer tx link), then the federated VerdictCard and the
   on-chain ReputationBoard. Every Casper tx hash links to cspr.live.
4. **Demo (`/demo`).** A guided, narrated walkthrough of one claim end to end (the
   "lying" claim is the showcase: paperwork says $12.5M, the chain says ~2687
   CSPR, solvency vetoes). Good for first-time visitors and the submission video.

## Architecture

- **Next.js (App Router)** in a new top-level `ui/` directory.
- **Reuse the orchestrator, don't duplicate it.** The UI's API routes import the
  existing functions (`relayPanel`, `judgeFacet`, `openClaim`, `finalize`,
  `resolveClaim`, and the `chainread` decoders) so the panel logic stays in one
  place. The `ui/` app depends on the `orchestrator/` package.
- **API routes** (server side, where the keys live):
  - `POST /api/claim/run` — opens a claim and runs the panel, streaming progress
    back as Server-Sent Events so judge cards populate one at a time instead of
    the page freezing for minutes.
  - `GET /api/reputation` — returns each judge's current on-chain reputation.
  - `GET /api/claims` — recent claims with their finalized status (best-effort).
- **Streaming.** SSE from `/api/claim/run`: events for claim-opened, each
  facet-started / facet-fetched / facet-verdict / facet-submitted, finalized, and
  error. The client renders each as it lands.

## The two hard parts (called out so they're budgeted, not discovered late)

1. **Reading reputation on-chain.** Today reputation is only recoverable by
   decoding a `resolve_claim` tx's effects. The board needs `get_reputation(judge)`
   on demand. Solve with a proper Casper read: query the Tribunal contract's
   reputation dictionary via `casper-js-sdk` `getDictionaryItem` (deriving the
   Odra Mapping item key from the judge address), with a fallback of decoding the
   latest resolve effects if the dictionary path proves unreliable. This is its
   own task with its own verification.
2. **Live GenLayer latency.** A full panel run is minutes and studionet can throw
   transient errors. Mitigations: SSE streaming so the UI stays responsive, the
   existing `withRetry`/`pollRead` logic in `genlayer.ts`, per-judge "retrying"
   state in the UI, and graceful per-facet error display. The app is genuinely
   live; the submission video can pre-warm a run.

## CSPR.click wallet

Wallet connect in the header via CSPR.click's current SDK. Judge verdicts stay
server-signed by the judge keys (that's the design). The connected wallet is used
for the user-initiated, user-signed actions: `open_claim` and `finalize`. If
CSPR.click integration proves heavy, it degrades to a "connect" affordance that
still lets the server-side flow run, so the wallet is additive, never a blocker.

## Visual system (the color effort)

- Layered dark base (stacked near-black indigo surfaces with depth), glassy raised
  cards, soft violet glow behind the hero and the critical card.
- Signature violet-to-magenta gradient on primary actions and the logo.
- Per-judge accent colors, carried across every page: Authenticity blue, Solvency
  coral (the one that can veto), Custodian teal, Valuation amber.
- Status colors with weight: PASS green, FAIL red, UNCERTAIN amber.
- Motion: judge cards animate in as each reports; subtle transitions, no
  gratuitous animation. Accessible contrast in the dark theme throughout.
- Built with the frontend-design skill for production-grade quality, not a
  template look.

## Components

`SiteNav`, `Hero`, `JudgeStrip`, `Footer` (landing); `ArchitectureSection`,
`FacetExplainer`, `FederationExplainer`, `ReputationExplainer` (how it works);
`ClaimForm`, `JudgePanel` + `JudgeCard`, `VerdictCard`, `ReputationBoard`,
`TxLink`, `WalletButton` (dashboard); `GuidedDemo` (demo). Each component has one
clear job and reads its data through a typed interface.

## Error handling

- API routes catch and surface per-facet errors as SSE error events; the UI shows
  the specific judge as errored without sinking the whole run.
- Reputation read failures show a clear "couldn't read on-chain" state, never a
  fabricated number.
- Missing env / proxy down surfaces a readable setup message, not a stack trace.

## Testing

- Component-level: the pure render pieces (JudgeCard states, VerdictCard bands)
  with a few representative props.
- The reputation key-derivation helper gets a unit test against a known judge
  address + expected dictionary item.
- Manual: a full live run against Testnet from the Dashboard, verified end to end
  (the build's acceptance check).

## Out of scope (for now)

- Submitting brand-new arbitrary claims from the browser with custom evidence
  shapes (the four example claims + paste-JSON cover the demo).
- A second adapter / non-CSPR reserves (already deferred at the project level).
- User-facing auth/accounts.
