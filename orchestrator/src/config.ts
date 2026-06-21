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

  // GenLayer
  genlayerChain: process.env.GENLAYER_CHAIN ?? "studionet",
  genlayerEndpoint: process.env.GENLAYER_ENDPOINT ?? "",
  genlayerDeployerKey: process.env.GENLAYER_DEPLOYER_PRIVATE_KEY ?? "",
} as const;

export function requireEnv(name: keyof typeof config): string {
  const v = config[name];
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v as string;
}
