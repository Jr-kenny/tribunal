# Tribunal design spec

Date: 2026-06-21
Author: Kenny (Jr-kenny)
Event: Casper Agentic Buildathon 2026, Qualification Round (DoraHacks, hosted by Casper Association)
Qualification deadline: 2026-06-30

## What it is, in one line

Tribunal is a multi-agent RWA verification oracle. A panel of specialist GenLayer judges each
checks one facet of a real-world-asset claim, and a Casper (Odra) contract federates their
verdicts into one auditable answer, weighting each judge by an on-chain reputation it stakes and
slashes over time.

## In plain English (this is the pitch, reuse it in the README and demo)

Imagine someone walks up and says "this token is backed by 10 million dollars of real assets,
here's my paperwork." We don't just trust them. We send in a little panel of expert inspectors,
and each inspector only cares about one thing.

- One inspector checks: is this paperwork even real and recent, or did you photoshop it?
- Another checks: the money you say is in the vault, is it actually in the vault?
- Another checks: the company you say is holding it, are they legit or are they shady?
- The last one checks: you say it's worth 10 million, but is that actually what it's worth on the market?

Each inspector is a GenLayer agent, and the reason GenLayer matters is that each inspector isn't
one guy guessing, it's a whole room of validators agreeing on that one answer. So each inspection
is solid.

Now they all report back, and here's the smart part: we don't just count votes, because the
questions aren't equal. If the vault inspector comes back and says "the money isn't there," it's
over. Doesn't matter that the paperwork was pretty and the company seemed nice. No money in the
vault means not backed, period. That's the veto: some inspectors can sink the whole claim on
their own.

But if nobody raises a dealbreaker, then we blend everyone's read into one overall answer, and we
trust the inspectors who've been right before more than the ones who've been flaky. That's the
reputation part: your track record decides how much your word counts.

Out the other end you get one clean answer the world can use: "yeah, backed, pretty confident" or
"nope, not backed." And if anyone's curious why, they can peek and see exactly which inspector
dragged it down.

Later, when the truth actually comes out, every inspector gets graded on whether they called it
right. Good calls build their reputation, bad calls cost them. So over time the reliable
inspectors rise and the sloppy ones fade, automatically.

That's the whole thing. A panel of sharp specialists, one of them can veto, the trusted ones
count more, and they all live or die by their record. Casper is the building that keeps all the
records and runs the scoring.

## Originality

All code and content is original and newly developed for the Buildathon. The novel parts (claim
decomposition into one specialist judge per facet, reputation-weighted federation with
critical-facet veto, on-chain reputation staking, and the attestation registry) are all new and
all live on Casper. GenLayer is used as the judgement engine the way you'd reach for any strong
tool, while the consensus, federation, and economics that make Tribunal what it is run on Casper.

## The stack (verified current as of 2026-06-21)

- On-chain: Odra 2.8 (Rust to WASM), deployed to Casper Testnet via `cargo odra`.
- Judges: off-chain GenLayer agents, one per facet. Each runs its own GenLayer consensus
  (Optimistic Democracy) on its own sub-question, so no two judges vote the same thing.
- Chain access: Casper MCP server (read plus local-signed submit) and/or CSPR.cloud SDK for
  posting verdicts and reading contract state.
- Payments: x402 for any paid evidence endpoint a judge needs to call (casper-x402 reference).
- Wallet and demo UI: CSPR.click for signing, CSPR.cloud APIs for data, thin web UI to submit a
  claim, watch the judges report, and show the final on-chain verdict plus the reputation board.

## Architecture (approach C: on-chain verdicts and finalize, off-chain orchestration)

The trust-critical logic lives on Casper. Only the boring orchestration (which judges to ask,
when to trigger finalize) lives off-chain.

Components:

1. Facet judges (off-chain GenLayer agents). One judge per facet. Each judge has:
   - its own Casper key (so its verdicts and reputation attach to a distinct on-chain identity),
   - a GenLayer contract that renders consensus on its single sub-question,
   - an evidence adapter that knows how to fetch what that facet needs.
   A judge takes a claim, fetches evidence (paying via x402 if the endpoint requires it), runs its
   GenLayer judgement, and gets back a verdict (PASS / FAIL / UNCERTAIN) plus a confidence.

2. Tribunal contract (Odra, on Casper Testnet). This is the heart. It holds:
   - the registry of judges and their reputation,
   - open claims and the per-facet verdicts submitted against them,
   - the federation logic (veto plus reputation-weighted aggregation),
   - the finalized canonical verdict per claim, queryable forever,
   - the reputation staking and slashing on resolution.

3. Orchestrator (off-chain). Reads a submitted claim, dispatches it to the relevant judges, waits
   for their GenLayer verdicts, relays each verdict onto Casper signed by that judge's key
   (carrying the GenLayer tx hash as proof), then calls `finalize(claim)`. Permissionless in
   spirit: anyone could call finalize, the orchestrator is just convenience.

4. Demo UI (thin web app). Submit a claim, watch the four judges report in, show the final
   on-chain verdict with its confidence and per-facet breakdown, and a reputation leaderboard.

### Claim decomposition (the creative core)

One RWA claim fans out to several facets, each its own GenLayer judge asking only its question.
For the proof-of-reserves adapter:

- Authenticity judge: is the issuer's attestation document genuine, properly signed, and recent?
- Solvency judge (critical): does the on-chain reserve balance actually cover the stated liabilities?
- Custodian judge: is the named custodian or attestor real and not flagged anywhere?
- Valuation judge: does the claimed value hold up against independent market pricing?

No judge re-asks another judge's question, so there is zero redundant consensus. Judges
legitimately differ because they answer different things.

### Federation logic (how one final verdict is produced)

Each facet carries two settings in the contract: a weight, and whether it is critical. Each judge
submits a verdict and a confidence, and each judge has an on-chain reputation. On `finalize`, the
contract does two passes:

1. Veto pass (critical facets). If a critical facet returns FAIL with reputation-weighted
   confidence above a threshold, the overall verdict is NOT_BACKED, regardless of the others.
   (Authentic paperwork over an empty vault is still an unbacked token.)

2. Weighted pass (everything else). If nothing vetoes, combine the facet verdicts into a
   reputation-weighted confidence score and map it to a band: BACKED / DISPUTED / NOT_BACKED.

Worked example:

| Judge | Facet | Verdict | Confidence | Reputation |
|-------|-------|---------|-----------|------------|
| 1 | Authenticity | PASS | 0.92 | 0.80 |
| 2 | Solvency (critical) | FAIL | 0.85 | 0.90 |
| 3 | Custodian | PASS | 0.70 | 0.60 |
| 4 | Valuation | PASS | 0.88 | 0.75 |

Three of four passed, but solvency is critical and fails with weighted confidence 0.90 x 0.85 =
0.77, over threshold. Final verdict: NOT_BACKED. That outcome is correct and is also the strongest
single demo moment, because it shows immediately why this beats a naive majority vote. Flip
solvency to PASS and nobody vetoes, so the weighted pass lands around BACKED, 0.86.

The contract keeps the per-facet breakdown on-chain next to the headline verdict, so a consumer
can read "BACKED 0.86" or drill in and see which facet was the soft spot.

### Reputation and resolution

When ground truth later lands, each judge is scored on whether its own facet call was right, not
on whether the group's headline verdict was right. Good calls build reputation, bad calls slash
it, so reliable judges accrue weight over time.

One detail to settle properly (not glossed): some facets have cleanly observable ground truth
(did the reserves cover the liabilities, yes or no), and some do not. For facets without directly
observable truth, scoring falls back to the resolved overall outcome. The exact resolution path
(who submits ground truth, how disputes are handled) is specified in the implementation plan, not
hand-waved here.

## Adapters (the claim-agnostic part)

The contract and judge interface are claim-agnostic: they only ever see a claim id, an evidence
pointer, a verdict, and a confidence. What varies per claim type is a small evidence adapter on
the judge side.

- Proof-of-reserves adapter (built first, qualification rides on this). Real fetchable data.
- Document-authenticity adapter (layered on second, proves the "general oracle" claim on camera).

## Scope and qualification discipline

Qualification bar: a working prototype on Casper Testnet with a transaction-producing on-chain
component, an open-source GitHub repo with README, and a public demo video.

- Must-have (qualification): proof-of-reserves adapter wired end to end, judges posting verdicts
  to a deployed Tribunal contract on Casper Testnet, `finalize` producing a real on-chain verdict,
  thin UI showing it. This alone qualifies.
- Second (proves generality): document-authenticity adapter.
- Stretch: polish for the CSPR.fans community-vote fast-track to finals.

Discipline: proof-of-reserves is finished first. If anything slips, we still have a working
Testnet demo and we still qualify.

## Open questions to settle in the plan

- Exact Odra storage layout for judges, claims, verdicts, reputation (Mapping vs List vs SubModule).
- Reputation math (numeric range, update step size, slashing curve) and the veto threshold value.
- How a judge's GenLayer verdict is relayed to Casper and how the GenLayer tx hash is carried as proof.
- Resolution path: who submits ground truth, dispute handling, scoring of unobservable facets.
- Number of judges for the demo (four for proof-of-reserves) and whether all four ship for qualification or a subset.
