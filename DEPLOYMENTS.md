# Deployments

## Casper Testnet (casper-test)

Tribunal contract (Odra 2.8, the federation + reputation oracle):
- Package hash: `hash-5ee74e27aeee192f6c4fe9fb82ae99ffa14d3986288359fef58e61f520151a19`
- Install tx: https://testnet.cspr.live/transaction/2f2f398f4cbf3a4e2d8e91dec6512e115613aeb63f06a579825358b7e0de35e2
- All four facets configured; solvency judge (deployer key) registered.

The contract is live and exercised: `open_claim`, `submit_verdict`, and `finalize`
all execute cleanly on testnet (verified on the receipts, not just ACCEPTED).

## GenLayer FacetJudges (the panel)

One deployed FacetJudge per facet, each code-verified on-chain (`genlayer code`):

- Authenticity: `0x1FeFc4de7737dfbe3132140d61F733Fa802B3680`
- Solvency: `0x324f3e4F53AEF007fAB346dee9b04Ee2f6194b2b`
- Custodian: `0x98138498403B6DFd0300Fe44E71a44A05FFE53Ee`
- Valuation: `0x6f57d0e8Fe5F6B23b4C0c87aBeeBBC7eFB80Cb1F`

Two facets now fetch their own truth under consensus:
- Solvency reads the reserve wallet's balance live off Casper (`read_reserve`,
  strict_eq) and decides against that on-chain figure, not the paperwork. Proven
  on a "lying" claim (attests $12.5M; wallet holds ~2687 CSPR): FAIL citing the
  real balance.
- Valuation reads a live USD market price (`read_price`, CoinGecko) under a
  tolerance-band equivalence (validators agree within 5%, since prices drift).
  Stored in micro-USD so sub-cent assets keep precision. Proven reading CSPR at
  ~$0.0024 and judging against it.

Authenticity and custodian still reason over the supplied evidence; their own
fetches (signature/attestation verification, registry/sanctions lookup) are the
next layer, mirroring solvency and valuation.

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

Both runs were driven by `cli.ts claim <evidence>`, which opens the claim, reads
the assigned id from open_claim's effects, runs the panel, and decodes the final
ClaimStatus off-chain. No claim ids or outcomes are guessed.

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
