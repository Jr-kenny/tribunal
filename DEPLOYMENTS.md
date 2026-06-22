# Deployments

## Casper Testnet (casper-test)

Tribunal contract (Odra 2.8, the federation + reputation oracle):
- Package hash: `hash-d6c8b87c8e201265ec4f5f32dc0f01f36adb13a93a4a659ed29740c020afb5bd`
- Install tx: https://testnet.cspr.live/transaction/43fd9bcea5963093b447c0f137058ebc614644127b3c5f2c157b1c4b154b1f97
- All four facets configured; deployer + all four judge keys registered.

Note: redeployed 2026-06-22 to add the registry features (`open_claim_with_evidence`
plus `ClaimOpened` / `ClaimFinalized` events). A fresh deploy resets reputation, so
the four judges were re-registered and one resolution was re-run to restore the
board (authenticity/solvency/custodian 5500, valuation 4500), verified by reading
each judge's slot off the new contract. The previous contract was
`hash-5ee74e27aeee192f6c4fe9fb82ae99ffa14d3986288359fef58e61f520151a19` (its
historical txs, e.g. the recorded panel runs, remain valid on-chain).

The contract is live and exercised: `open_claim`, `submit_verdict`, and `finalize`
all execute cleanly on testnet (verified on the receipts, not just ACCEPTED).

## GenLayer FacetJudges (the panel)

One deployed FacetJudge per facet, each code-verified on-chain (`genlayer code`):

- Authenticity: `0xbC694BEb00Afb616B03C1F9d33e1c5972dB92F7E`
- Solvency: `0x95Ebac70f5a1dEc310586eF6292097A48bDe64b8`
- Custodian: `0x89702F3113F2E9a2430a902ed2ab1Ac13970291B`
- Valuation: `0xf56B39c091Ec6D112Cb3dF372aCcB83a1f8055C4`

All four facets now fetch their own truth under GenLayer consensus, each matched
to the right equivalence rule for its source:
- Solvency reads the reserve wallet's balance live off Casper (`read_reserve`,
  strict_eq, exact). Proven on a "lying" claim (attests $12.5M; wallet ~2687 CSPR): FAIL.
- Valuation reads a live USD market price (`read_price`, CoinGecko) under a
  custom validator with a 5% tolerance band (prices drift). Micro-USD so sub-cent
  assets keep precision. Proven reading CSPR ~$0.0023.
- Custodian looks the named entity up in a public knowledge source (`read_custodian`,
  Wikipedia REST), validators agreeing on found + title. Proven resolving "BitGo".
- Authenticity fetches the attestation document from its URL and verifies its
  SHA-256 (`read_attestation`, strict_eq on the hash). Proven: integrity matched
  but the judge still FAILed a hash-valid document that was the wrong kind of file.

The relay routes every GenLayer RPC call through a retry wrapper, since studionet
throws transient connect-timeouts under load; a blip now retries instead of
crashing a panel run. The get_* views are polled tolerantly too: GenLayer has
read-after-write lag, so a verdict/reserve/price read retries through the brief
"not committed yet" window instead of failing.

### Per-judge Casper identities (reputation per judge)

Each facet judge has its own Casper key (funded ~50 CSPR from the deployer, no
faucet; registered via `register_judge`), so its verdict accrues reputation under
its own address rather than all four sharing the deployer key. Keys live in the
gitignored `.keys/casper/judges/`; regenerate/register with
`orchestrator/scripts/setup-judge-keys.mjs`. Verified on claim 12: each
`submit_verdict` was signed by its own judge key, none by the deployer.

### Full four-judge panel run (claim 8, unbacked example)

Claim id read back from `open_claim`'s effects (not guessed). Two facets fetched
their own truth under consensus during the run: solvency read the reserve (2653
CSPR live off Casper) and valuation read the live price ($0.002377), both cited
in their verdicts. All Casper txs executed cleanly; final status read from chain
(claim_status 00 Open -> 03 NotBacked):

- authenticity UNCERTAIN @ 9000, solvency FAIL @ 10000, custodian UNCERTAIN @ 9500, valuation FAIL @ 8500
- finalize tx: `60d6603832ac50e2dc6eb74d3858ae04db5fb7976a317faa0554b047425f43e8`
- outcome: NotBacked (Pass 1 critical veto: solvency FAIL weighted 5000 >= 4000)

Note: GenLayer's studionet RPC had transient connect-timeouts during one earlier
attempt (claims 6 and 7 left unfinalized). A retry wrapper around the judge calls
would make a mid-panel blip non-fatal; not yet added.

### Full four-judge panel run (claim 5, backed example)

A CSPR-collateralized note whose on-chain reserve genuinely covers it:

- authenticity UNCERTAIN @ 9500 (plain-text attestation, no signature to verify),
  solvency PASS @ 9000 (2671 CSPR read live >= 2000 CSPR liability, same asset),
  custodian PASS @ 8500, valuation PASS @ 9500
- finalize tx: `b8b499be977e1ec2b60dfad1b2fcc23e3862f0aa32058f45d1bfa34b09769fb3`
- outcome: Backed (Pass 2: UNCERTAIN abstains, three PASS average 9000 >= 7000)

### Full four-judge panel run (claim 10, all four fetching)

A backed claim where every facet fetched its own truth in one run:

- authenticity fetched the referenced document, SHA-256 matched, but FAILed @ 9800
  (the file is a software license, not an attestation, hash-valid but wrong document)
- solvency PASS @ 10000 (2640 CSPR read live >= 2000 CSPR liability)
- custodian PASS @ 10000 ("BitGo" resolved in a public knowledge source)
- valuation PASS @ 9500 (live CSPR price $0.002306 read under consensus)
- finalize tx: `b816d000bb36c3a520270e314f44905d682aed8add1820ae81e7eeddd7f75f3d`
- outcome: Disputed (one strong non-critical FAIL pulls the aggregate to ~4925,
  between the 4000 and 7000 bands: real money and custodian, bogus paperwork)

All runs were driven by `cli.ts claim <evidence>`, which opens the claim, reads
the assigned id from open_claim's effects, runs the panel, and decodes the final
ClaimStatus off-chain. No claim ids or outcomes are guessed.

### Resolution / reputation loop, run live (claim 13)

The resolve step (scoring each judge against ground truth and moving its
reputation per judge) was coded and unit-tested but had never run on-chain until
now. Recorded here so it isn't mistaken for a real panel run: the four verdicts on
claim 13 were HAND-SET to exercise the resolution path, not produced by GenLayer
(the real panel runs are claims 5/8/10). Each verdict carried the proof string
"demo:resolution-loop (hand-set verdict, not a GenLayer run)".

Sequence (all signed by the four judges' own Casper keys; resolve signed by admin):
- open_claim -> claim 13
- authenticity PASS @ 9000, solvency FAIL @ 9500, custodian PASS @ 8500, valuation FAIL @ 8000
- finalize -> NotBacked (solvency FAIL vetoed), tx `f25feb28ff4938aadc30a55d8406e9a29bbead9e9af9857be6048c4cfa5bd4bf`
- ground truth: facets 1, 3, 4 were true and solvency (2) really failed (mask 26)
- resolve_claim tx `1540e7758db123200ca52d88122d5a597528658fdc4492b69fdca16999a7425a`

The reputation divergence was read straight off the resolve tx's effects (not the
contract rule asserted): the four reputation writes were `[4500, 5500, 5500, 5500]`.
Every judge started at 5000; authenticity, solvency, and custodian each called
their facet correctly and stepped up to 5500, while valuation called it wrong
(FAIL on a facet that was actually true) and was slashed to 4500. That closes the
vision loop: per-judge reputation actually diverges based on who was right.

Reproduce with `orchestrator/scripts/demo-resolution.mjs` (proxy up), or resolve
any claim with `cli.ts resolve <claimId> <truthMask>`.

### History / correction

An earlier record here listed a solvency judge at
`0xDb6A7A526127500486d5Cb5dBF6039F487AA2E9E` as deployed (5/5 validators AGREE,
ACCEPTED). That address does not exist on-chain. The deploy reached ACCEPTED but
execution failed in `__init__` (`gl.message.sender_account` does not exist on this
runner; the attribute is `sender_address`), so no contract was ever created. The
"first end-to-end claim" recorded against it carried a hand-fed verdict, not one
produced by a live judge. Lesson kept: on GenLayer, ACCEPTED/FINALIZED is the
lifecycle status, not proof of execution; always read the receipt's execution
result (and confirm `genlayer code <addr>` resolves) before recording a deploy.
