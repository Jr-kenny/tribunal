# Deployments

## Casper Testnet (casper-test)

Tribunal contract (Odra 2.8, the federation + reputation oracle):
- Package hash: `hash-5ee74e27aeee192f6c4fe9fb82ae99ffa14d3986288359fef58e61f520151a19`
- Install tx: https://testnet.cspr.live/transaction/2f2f398f4cbf3a4e2d8e91dec6512e115613aeb63f06a579825358b7e0de35e2
- All four facets configured; solvency judge (deployer key) registered.

The contract is live and exercised: `open_claim`, `submit_verdict`, and `finalize`
all execute cleanly on testnet (verified on the receipts, not just ACCEPTED).

## GenLayer (solvency FacetJudge)

- Contract address: `0x324f3e4F53AEF007fAB346dee9b04Ee2f6194b2b`
- This judge reads the reserve wallet's balance live off Casper under GenLayer
  consensus (`read_reserve`) and decides against that on-chain figure, not against
  any reserve number stated in the claim's paperwork. Proven on a crafted "lying"
  claim (paperwork attests $12.5M backing; the wallet holds ~2687 CSPR): the judge
  returns FAIL @ 10000bps citing the real on-chain balance.

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
