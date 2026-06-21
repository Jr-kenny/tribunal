# Deployments

## Casper Testnet (casper-test)

Tribunal contract (Odra 2.8, the federation + reputation oracle):
- Package hash: `hash-5ee74e27aeee192f6c4fe9fb82ae99ffa14d3986288359fef58e61f520151a19`
- Install tx: https://testnet.cspr.live/transaction/2f2f398f4cbf3a4e2d8e91dec6512e115613aeb63f06a579825358b7e0de35e2
- All four facets configured; solvency judge (deployer key) registered.

First end-to-end claim (solvency FAIL @ 0.85 -> critical veto -> NotBacked):
- open_claim:  https://testnet.cspr.live/transaction/63f35e71326ac079353c0896baa39656fa322363bbcfe8b328fcc66d99c1fa0a
- submit_verdict: https://testnet.cspr.live/transaction/a238a6eb2cc8864672d1cc4e5cac36304248333387c28a450a8046b65cad6aea
- finalize: https://testnet.cspr.live/transaction/18f8e19d3b4088569c50ea42fa4bb465dc6706ac4fafc80b36d57f76aee61fe7

## GenLayer (solvency FacetJudge)

- Contract address: `0xDb6A7A526127500486d5Cb5dBF6039F487AA2E9E`
- Deploy tx: `0xe20ed0459df7a14ec0f0582bc93145f09dd8a9d43caa924fa1385bc2a5e101d5`
- Consensus: 5/5 validators AGREE, ACCEPTED.
