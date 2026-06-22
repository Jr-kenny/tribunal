/** @type {import('next').NextConfig} */
// externalDir lets the app import the sibling orchestrator/src TypeScript directly,
// so the panel logic lives in one place instead of being duplicated here.
const nextConfig = {
  experimental: { externalDir: true },
  // casper-js-sdk and genlayer-js are heavy CJS/Node libs; keep them external on the
  // server so Next doesn't try to bundle them.
  serverExternalPackages: ["casper-js-sdk", "genlayer-js"],
  webpack: (config) => {
    // the orchestrator's TS files import each other with ".js" extensions (ESM style);
    // tell webpack to resolve a ".js" import to the ".ts"/".tsx" source.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
