import "dotenv/config";

// All secrets and network endpoints come from the environment. Never inline a
// key here. See .env.example for the variables to set.
export const config = {
  // Casper
  casperNodeUrl: process.env.CASPER_NODE_URL ?? "https://node.testnet.cspr.cloud/rpc",
  casperNetwork: process.env.CASPER_NETWORK ?? "casper-test",
  casperSecretKeyPath: process.env.CASPER_SECRET_KEY ?? "",
  tribunalContractHash: process.env.TRIBUNAL_CONTRACT_HASH ?? "",
  csprCloudKey: process.env.CSPR_CLOUD_KEY ?? "",

  // public no-auth Casper node the GenLayer judge reads from (validators can't reach our proxy)
  casperPublicNodeUrl: process.env.CASPER_PUBLIC_NODE_URL ?? "https://node.testnet.casper.network/rpc",

  // GenLayer (network names: localnet | studionet | testnet-asimov | testnet-bradbury)
  genlayerNetwork: process.env.GENLAYER_NETWORK ?? "studionet",
  genlayerDeployerKeyPath: process.env.GENLAYER_DEPLOYER_KEY ?? "",
  // one deployed FacetJudge per facet (the panel)
  genlayerAuthenticityJudge: process.env.GENLAYER_AUTHENTICITY_JUDGE ?? "",
  genlayerSolvencyJudge: process.env.GENLAYER_SOLVENCY_JUDGE ?? "",
  genlayerCustodianJudge: process.env.GENLAYER_CUSTODIAN_JUDGE ?? "",
  genlayerValuationJudge: process.env.GENLAYER_VALUATION_JUDGE ?? "",
} as const;

export function requireEnv(name: keyof typeof config): string {
  const v = config[name];
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v as string;
}
