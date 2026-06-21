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
- Valuation: `0xBfC0fb8D42F299DE54819E369410B4eBF88E3373`

Solvency reads the reserve wallet's balance live off Casper under GenLayer
consensus (`read_reserve`) and decides against that on-chain figure, not against
any reserve number stated in the claim's paperwork. Proven on a crafted "lying"
claim (paperwork attests $12.5M backing; the wallet holds ~2687 CSPR): the judge
returns FAIL citing the real on-chain balance. Authenticity, custodian, and
valuation currently reason over the supplied evidence; their own per-facet
on-chain/external fetches (price feed, registry/sanctions, signature check) are
the next layer, mirroring how solvency reads the chain.

### Full four-judge panel run (claim 4, unbacked example)

Claim id read back from `open_claim`'s effects (not guessed). All Casper txs
executed cleanly; final status read from chain (claim_status 00 Open -> 03 NotBacked):

- authenticity UNCERTAIN @ 8200, solvency FAIL @ 9900, custodian UNCERTAIN @ 9500, valuation FAIL @ 9500
- finalize tx: `78ca71ea97c9f5e5b39112c82ac650c1d2b975ccc39f2b3aa83246fc3a9790db`
- outcome: NotBacked (critical solvency FAIL, weighted 4950 >= 4000 veto threshold)

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
