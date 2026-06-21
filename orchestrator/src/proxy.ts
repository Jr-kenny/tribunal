// Local auth-injecting proxy for CSPR.cloud.
//
// CSPR.cloud's node RPC needs an Authorization header, but casper-client and the
// Odra livenet deployer don't send custom headers. This tiny proxy listens on
// localhost, adds the header, and forwards to the upstream node. Point every
// Casper tool at http://localhost:<port>/rpc and forget the auth exists.
//
// Run: CSPR_CLOUD_KEY=... npx tsx src/proxy.ts
// Env:
//   CSPR_CLOUD_KEY   (required) your CSPR.cloud access token
//   PROXY_PORT       (default 7777)
//   CASPER_UPSTREAM  (default https://node.testnet.cspr.cloud/rpc)

import http from "node:http";
import https from "node:https";
import { URL } from "node:url";
import "dotenv/config";

const TOKEN = process.env.CSPR_CLOUD_KEY ?? "";
const PORT = Number(process.env.PROXY_PORT ?? 7777);
const UPSTREAM = new URL(process.env.CASPER_UPSTREAM ?? "https://node.testnet.cspr.cloud/rpc");

if (!TOKEN) {
  console.error("CSPR_CLOUD_KEY is required");
  process.exit(1);
}

const server = http.createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    const upstreamReq = https.request(
      {
        hostname: UPSTREAM.hostname,
        port: UPSTREAM.port || 443,
        path: UPSTREAM.pathname,
        method: req.method,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": body.length,
          Authorization: TOKEN,
        },
      },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
        upstreamRes.pipe(res);
      },
    );
    upstreamReq.on("error", (err) => {
      console.error("upstream error:", err.message);
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "upstream error", detail: err.message }));
    });
    upstreamReq.end(body);
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`CSPR.cloud auth proxy: http://127.0.0.1:${PORT}/rpc -> ${UPSTREAM.href}`);
});
