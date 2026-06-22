# Tribunal Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a real multi-page Next.js frontend for Tribunal (Landing, How it works, Dashboard, Demo) that explains the product and runs the panel live against the Casper Testnet contract and GenLayer judges.

**Architecture:** A new `ui/` Next.js App Router app. Client pages call Next route handlers (server, Node runtime) that reuse the existing `orchestrator/` functions to open/run/finalize/resolve claims and read on-chain reputation. The long panel run streams progress to the client over Server-Sent Events. Dark editorial theme with a violet accent and per-judge colors.

**Tech Stack:** Next.js (App Router, TypeScript), React, the existing `orchestrator` (casper-js-sdk, genlayer-js), CSPR.click for wallet, SSE for streaming. Per the design spec at `docs/superpowers/specs/2026-06-22-tribunal-ui-design.md`.

---

## File structure

```
ui/
  package.json                 # Next app; depends on the local orchestrator
  next.config.mjs              # transpilePackages + externalDir to import ../orchestrator/src
  tsconfig.json
  app/
    layout.tsx                 # root layout, theme, fonts, <SiteNav/> + <Footer/>
    globals.css                # design tokens (colors, surfaces), base dark theme
    page.tsx                   # Landing
    how-it-works/page.tsx      # How it works
    dashboard/page.tsx         # Dashboard (client component)
    demo/page.tsx              # Guided demo (client component)
    api/claim/run/route.ts     # POST: open + run panel, stream SSE
    api/reputation/route.ts    # GET: per-judge on-chain reputation
  lib/
    theme.ts                   # color tokens shared by components (per-judge colors etc.)
    facets.ts                  # facet metadata for the UI (name, color, question, icon)
    types.ts                   # shared UI types (PanelEvent, JudgeView, etc.)
    sse.ts                     # tiny client helper to consume the SSE stream
  components/
    SiteNav.tsx  Footer.tsx  Hero.tsx  JudgeStrip.tsx
    Section.tsx  Diagram*.tsx (how-it-works sections)
    ClaimForm.tsx  JudgePanel.tsx  JudgeCard.tsx  VerdictCard.tsx
    ReputationBoard.tsx  TxLink.tsx  WalletButton.tsx
orchestrator/
  src/reputation-read.ts       # NEW: read get_reputation per judge from chain
  src/judge-accounts.ts        # NEW: map facet -> judge account hash (from key files)
```

---

## Milestone 0: Scaffold + theme

### Task 0.1: Create the Next.js app

**Files:** Create `ui/package.json`, `ui/next.config.mjs`, `ui/tsconfig.json`, `ui/app/layout.tsx`, `ui/app/globals.css`, `ui/app/page.tsx` (placeholder).

- [ ] Step 1: Scaffold with the App Router, TypeScript, no Tailwind (hand-rolled CSS tokens for the bespoke theme). From repo root:
```bash
cd ui && npm init -y
npm i next@latest react@latest react-dom@latest
npm i -D typescript @types/react @types/node
```
- [ ] Step 2: `next.config.mjs` enables importing the sibling orchestrator:
```js
const nextConfig = { experimental: { externalDir: true }, transpilePackages: [] };
export default nextConfig;
```
- [ ] Step 3: Add a placeholder `app/page.tsx` returning `<main>Tribunal</main>`, a root `app/layout.tsx`, and `app/globals.css`.
- [ ] Step 4: Run `cd ui && npx next dev` and confirm it boots at localhost:3000.
- [ ] Step 5: Commit `ui scaffold`.

### Task 0.2: Design tokens and theme

**Files:** `ui/app/globals.css`, `ui/lib/theme.ts`, `ui/lib/facets.ts`.

- [ ] Step 1: In `globals.css` define the dark layered palette as CSS variables: `--bg-0` (#0E0B20), `--bg-1` (#16122E), `--bg-2` (#1E1840), `--surface` (glassy raised), `--border`, `--text`, `--text-dim`, `--accent` (#6A5FD6), `--accent-2` (magenta for the gradient), plus status colors (pass green, fail red, uncertain amber). Base body bg uses a subtle layered/radial treatment.
- [ ] Step 2: `lib/facets.ts` exports the four facets with `{ key, id, name, question, critical, color, icon }`: authenticity blue, solvency coral (critical), custodian teal, valuation amber. Matches the contract facet ids (1..4).
- [ ] Step 3: `lib/theme.ts` re-exports color helpers (e.g. `judgeColor(key)`).
- [ ] Step 4: Commit `theme + facet tokens`.

### Task 0.3: SiteNav + Footer + layout

**Files:** `ui/components/SiteNav.tsx`, `ui/components/Footer.tsx`, `ui/app/layout.tsx`.

- [ ] Step 1: `SiteNav` — logo (gavel + "Tribunal"), links to How it works / Dashboard / Demo, and a `WalletButton` slot on the right. Sticky, glassy.
- [ ] Step 2: `Footer` — short tagline, GitHub link (`https://github.com/Jr-kenny/tribunal`), "Casper Agentic Buildathon 2026".
- [ ] Step 3: Wire both into `layout.tsx` around `{children}`.
- [ ] Step 4: Commit `nav + footer + layout`.

---

## Milestone 1: Landing page

### Task 1.1: Hero + JudgeStrip

**Files:** `ui/components/Hero.tsx`, `ui/components/JudgeStrip.tsx`, `ui/app/page.tsx`.

- [ ] Step 1: `Hero` — live-on-Testnet badge, headline "Don't trust the paperwork. Send in the panel.", subhead, two CTAs (Open the dashboard → /dashboard, See how it works → /how-it-works). Violet glow behind, gradient on the primary CTA.
- [ ] Step 2: `JudgeStrip` — four cards from `lib/facets.ts`, each with icon, name, one-line question, per-judge color; solvency marked "can veto".
- [ ] Step 3: Compose in `page.tsx` with below-the-fold sections (problem, panel, veto, reputation) using a shared `Section` component.
- [ ] Step 4: Verify visually in the browser; commit `landing page`.

---

## Milestone 2: How it works

### Task 2.1: Explainer sections

**Files:** `ui/components/Section.tsx`, `ui/app/how-it-works/page.tsx`, plus small presentational diagram components.

- [ ] Step 1: Build four stacked sections: the three layers; the four judges + what each fetches (reuse `lib/facets.ts`); the two-pass federation rule (veto then weighted bands, with the deployed thresholds 4000/7000/4000); the reputation loop (reward/slash, cite the live `[4500,5500,5500,5500]` result).
- [ ] Step 2: Render the architecture and lifecycle as on-page CSS/SVG diagrams (not images) so they match the theme.
- [ ] Step 3: Verify visually; commit `how it works page`.

---

## Milestone 3: Server integration (the engine)

### Task 3.1: Judge account mapping

**Files:** Create `orchestrator/src/judge-accounts.ts`. Test: `orchestrator/test/judge-accounts.test.ts`.

- [ ] Step 1: Write a failing test: `judgeAccounts()` returns four entries `{ key, accountHashHex }`, derived from the four `.keys/casper/judges/<facet>.pem` files, with `accountHashHex` a 64-char hex string.
```ts
import { describe, it, expect } from "vitest";
import { judgeAccounts } from "../src/judge-accounts.js";
describe("judgeAccounts", () => {
  it("derives an account hash per facet key", () => {
    const a = judgeAccounts();
    expect(a.map(x => x.key).sort()).toEqual(["authenticity","custodian","solvency","valuation"]);
    for (const x of a) expect(x.accountHashHex).toMatch(/^[0-9a-f]{64}$/);
  });
});
```
- [ ] Step 2: Run `cd orchestrator && npx vitest run judge-accounts` — fails (module missing).
- [ ] Step 3: Implement `judge-accounts.ts`: read each `../.keys/casper/judges/<facet>.pem`, `C.PrivateKey.fromPem(...)`, `key.publicKey.accountHash()`, strip the `account-hash-` prefix to hex.
- [ ] Step 4: Run the test — passes.
- [ ] Step 5: Commit `derive judge account hashes from key files`.

### Task 3.2: Read reputation on-chain (the hard part)

**Files:** Create `orchestrator/src/reputation-read.ts`. Test: `orchestrator/test/reputation-read.test.ts`.

- [ ] Step 1: Determine the Odra storage read. Query the Tribunal contract's named keys via `RpcClient.queryLatestGlobalState` on the contract hash to find the reputation dictionary (Odra stores each `Mapping` under a named dictionary seed URef). Capture the dictionary name/URef.
- [ ] Step 2: Implement `readReputation(accountHashHex): Promise<number | null>` using `getDictionaryItemByIdentifier` with the dictionary seed URef and the Odra item key for an `Address` (the contract serializes the key; the item key is the base16 of the serialized address bytes). Return the decoded u32 bps, or `null` if not present.
- [ ] Step 3: Implement `readAllReputation()` mapping each facet's judge account hash (from Task 3.1) to its reputation, returning `{ key, bps }[]`.
- [ ] Step 4: Verification (live, not a unit assertion since it hits chain): a script logs `readAllReputation()` and we confirm it returns the four judges with sane bps (1000..10000), matching the known `[4500,5500,5500,5500]` from claim 13's resolve. If the dictionary-URef path proves unreliable, fall back to decoding the latest `resolve_claim` tx effects (already proven: `[4500,5500,5500,5500]`).
- [ ] Step 5: Commit `read per-judge reputation off-chain`.

### Task 3.3: Reputation API route

**Files:** `ui/app/api/reputation/route.ts`.

- [ ] Step 1: GET handler (Node runtime: `export const runtime = "nodejs"`) calls `readAllReputation()` and returns `{ judges: [{ key, name, color, bps }] }`, sorted desc. On error return `{ error }` with 500 and never a fabricated number.
- [ ] Step 2: Hit `/api/reputation` in the browser, confirm JSON.
- [ ] Step 3: Commit `reputation API route`.

### Task 3.4: Claim-run SSE route

**Files:** `ui/app/api/claim/run/route.ts`, `ui/lib/types.ts`.

- [ ] Step 1: Define `PanelEvent` union in `lib/types.ts`: `claim-opened {claimId, tx}`, `facet-started {key}`, `facet-fetched {key, detail}`, `facet-verdict {key, vote, confidence, reason, genlayerTx}`, `facet-submitted {key, submitTx}`, `finalized {status, finalizeTx}`, `error {key?, message}`.
- [ ] Step 2: POST handler (nodejs runtime, streaming `Response` with `text/event-stream`). Body: `{ claimKey }` (one of the example files) or `{ evidence }`. It opens the claim (`openClaim` + `confirm` + `claimIdFromOpen`), then for each facet runs `judgeFacet`-equivalent steps, emitting an SSE event at each stage, then `finalize` + decode status, emitting `finalized`. Wrap per-facet work so an error emits a `facet error` event but the run continues where sensible.
- [ ] Step 3: Reuse orchestrator internals: import `openClaim, finalize` from `casper`, `confirm, claimIdFromOpen, statusFromDiff` from `chainread`, and the per-facet fetch+judge+submit from `orchestrate` (refactor `judgeFacet` to accept an optional `onEvent` callback so the route can stream; keep the CLI behavior intact).
- [ ] Step 4: Manually curl the endpoint with `{ "claimKey": "claim-backed" }` and watch events stream.
- [ ] Step 5: Commit `claim run SSE route + event types`.

### Task 3.5: Let judgeFacet stream

**Files:** Modify `orchestrator/src/orchestrate.ts`.

- [ ] Step 1: Add an optional `onEvent?: (e: PanelEvent) => void` param threaded through `judgeFacet`/`relayPanel`, emitting at fetch/verdict/submit. The CLI passes a console logger (unchanged output); the route passes an SSE writer. No behavior change when `onEvent` is undefined.
- [ ] Step 2: Run `cd orchestrator && npx tsc --noEmit` — clean.
- [ ] Step 3: Commit `thread an event callback through the panel run`.

---

## Milestone 4: Dashboard

### Task 4.1: Presentational pieces

**Files:** `ui/components/JudgeCard.tsx`, `ui/components/VerdictCard.tsx`, `ui/components/ReputationBoard.tsx`, `ui/components/TxLink.tsx`.

- [ ] Step 1: `JudgeCard` — states: pending, fetching (shows detail), retrying, verdict (vote badge + confidence + reason + GenLayer tx), error. Per-judge color border; solvency shows the critical/veto marker.
- [ ] Step 2: `VerdictCard` — Backed/Disputed/NotBacked with the right status color, score, the "why" line (e.g. "solvency vetoed"), finalize `TxLink`.
- [ ] Step 3: `ReputationBoard` — rows from `/api/reputation`, judge color dot, bps, sorted; clear "couldn't read" state on error.
- [ ] Step 4: `TxLink` — formats a hash and links to `https://testnet.cspr.live/transaction/<hash>` (Casper) or the GenLayer explorer for judge txs.
- [ ] Step 5: Commit `dashboard presentational components`.

### Task 4.2: Dashboard page wiring

**Files:** `ui/app/dashboard/page.tsx`, `ui/components/ClaimForm.tsx`, `ui/components/JudgePanel.tsx`, `ui/lib/sse.ts`.

- [ ] Step 1: `lib/sse.ts` — a `runClaim(body, onEvent)` helper that POSTs and parses the SSE stream into `PanelEvent`s.
- [ ] Step 2: `ClaimForm` — a select of the example claims (backed / unbacked / lying) + optional paste, and a "Run panel" button.
- [ ] Step 3: `JudgePanel` holds the four `JudgeCard`s keyed by facet; updates each from streamed events.
- [ ] Step 4: `dashboard/page.tsx` (client) wires ClaimForm → runClaim → JudgePanel + VerdictCard, and loads ReputationBoard on mount and after a run.
- [ ] Step 5: Run a full claim from the browser against Testnet; confirm the cards fill in and the verdict + board show real data.
- [ ] Step 6: Commit `dashboard page`.

---

## Milestone 5: Demo page

### Task 5.1: Guided walkthrough

**Files:** `ui/app/demo/page.tsx`, `ui/components/GuidedDemo.tsx`.

- [ ] Step 1: `GuidedDemo` narrates the lying claim in steps (the claim, the paperwork's $12.5M, the chain's ~2687 CSPR, solvency's veto, the NotBacked verdict), driving the same dashboard components but with explanatory copy between beats. It can run live or step through the last run's data.
- [ ] Step 2: Verify visually; commit `demo page`.

---

## Milestone 6: Wallet

### Task 6.1: CSPR.click connect

**Files:** `ui/components/WalletButton.tsx`, provider wiring in `ui/app/layout.tsx`.

- [ ] Step 1: Integrate CSPR.click per its current SDK (provider + connect button). Confirm exact package/import against its docs at build time.
- [ ] Step 2: Wire the connected account to user-signed `open_claim`/`finalize` where it cleanly fits; otherwise the button is a connect affordance and the server flow still runs. Judge signing stays server-side.
- [ ] Step 3: Verify connect works; commit `cspr.click wallet connect`.

---

## Milestone 7: Polish + verify

### Task 7.1: Live end-to-end + screenshots

- [ ] Step 1: With the proxy running, run each example claim from the Dashboard; confirm Backed / NotBacked(veto) outcomes and the reputation board.
- [ ] Step 2: Responsive + dark-contrast pass over all four pages.
- [ ] Step 3: Capture screenshots for the README/submission.
- [ ] Step 4: Commit `frontend polish + live verification`.

---

## Self-review notes

- Spec coverage: Landing (M1), How it works (M2), Dashboard (M4), Demo (M5), API+SSE (M3), reputation read (3.1/3.2), CSPR.click (M6), color system (0.2), error handling (3.3/3.4/4.1) all mapped.
- The reputation read is the riskiest task (Odra dictionary internals); it has an explicit proven fallback (decode resolve effects) so the board is never blocked.
- TDD is applied where it pays (account-hash derivation has a real unit test); UI components are verified visually/live, which is the right check for presentational code.
