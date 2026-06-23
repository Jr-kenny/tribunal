// Local CSPR.cloud bridge for the Odra livenet deployer.
//
// Two jobs:
//  1. Inject the CSPR.cloud Authorization header onto every JSON-RPC call, since
//     casper-client and the Odra deployer can't send custom headers. Point them
//     at http://localhost:<port>/rpc.
//  2. Synthesize the node SSE event stream that Odra's transaction watcher needs.
//     CSPR.cloud's hosted node has no /events SSE, and Odra refuses to send a
//     transaction until it has connected to one. The proxy sees every
//     put_transaction pass through /rpc, captures the returned hash, polls
//     info_get_transaction until the tx is processed, and emits the matching
//     {"TransactionProcessed":{"transaction_hash":{"Version1":"..."}}} SSE event.
//
// Run: CSPR_CLOUD_KEY=... npx tsx src/proxy.ts
// Env: CSPR_CLOUD_KEY (required), PROXY_PORT (7777), CASPER_UPSTREAM (testnet /rpc)

import http from "node:http";
import https from "node:https";
import { URL, fileURLToPath } from "node:url";
import "dotenv/config";

const TOKEN = process.env.CSPR_CLOUD_KEY ?? "";
const PORT = Number(process.env.PROXY_PORT ?? 7777);
// Bind localhost by default so local dev never exposes the bridge. When the
// proxy runs on its own host (Vercel can't reach 127.0.0.1), set PROXY_HOST=0.0.0.0.
const HOST = process.env.PROXY_HOST ?? "127.0.0.1";
// When exposed publicly the proxy is an open relay to CSPR.cloud under our key,
// so gate it with a shared secret. casper-js-sdk can't send custom headers
// (the reason this bridge exists), so the secret rides in the URL as ?k=… and
// callers point CASPER_NODE_URL at https://<host>/rpc?k=<token>. Unset = open,
// for frictionless local dev.
const AUTH = process.env.PROXY_AUTH_TOKEN ?? "";
const UPSTREAM = new URL(process.env.CASPER_UPSTREAM ?? "https://node.testnet.cspr.cloud/rpc");

// Hashes captured from put_transaction responses, awaiting a processed-confirmation.
const pending = new Set<string>();

// POST a JSON-RPC body to the upstream node with auth, returning the parsed JSON.
function rpc(body: unknown): Promise<any> {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify(body));
    const r = https.request(
      {
        hostname: UPSTREAM.hostname,
        port: UPSTREAM.port || 443,
        path: UPSTREAM.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": payload.length,
          Authorization: TOKEN,
        },
      },
      (resp) => {
        const chunks: Buffer[] = [];
        resp.on("data", (c) => chunks.push(c));
        resp.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    r.on("error", reject);
    r.end(payload);
  });
}

function extractHash(th: any): string | undefined {
  if (!th) return undefined;
  return th.Version1 ?? th.Deploy ?? undefined;
}

// Forward an RPC POST to upstream, capture any submitted transaction hash, return the response.
function handleRpc(req: http.IncomingMessage, res: http.ServerResponse) {
  const chunks: Buffer[] = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    let reqMethod = "";
    try {
      reqMethod = JSON.parse(body.toString("utf8"))?.method ?? "";
    } catch {
      // ignore
    }
    const upstreamReq = https.request(
      {
        hostname: UPSTREAM.hostname,
        port: UPSTREAM.port || 443,
        path: UPSTREAM.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": body.length,
          Authorization: TOKEN,
        },
      },
      (upstreamRes) => {
        const out: Buffer[] = [];
        upstreamRes.on("data", (c) => out.push(c));
        upstreamRes.on("end", () => {
          const respBody = Buffer.concat(out);
          try {
            const j = JSON.parse(respBody.toString("utf8"));
            const hex = extractHash(j?.result?.transaction_hash);
            if (hex) {
              pending.add(hex);
              console.log(`[bridge] captured submitted tx ${hex}`);
            } else if (j?.error) {
              console.log(`[rpc] ${reqMethod} -> ERROR ${JSON.stringify(j.error)}`);
            } else if (reqMethod.includes("put_transaction") || reqMethod.includes("put_deploy")) {
              console.log(`[rpc] ${reqMethod} -> ${respBody.toString("utf8").slice(0, 500)}`);
            }
          } catch {
            // not JSON or no hash, fine
          }
          res.writeHead(upstreamRes.statusCode ?? 502, {
            "Content-Type": "application/json",
          });
          res.end(respBody);
        });
      },
    );
    upstreamReq.on("error", (err) => {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "upstream error", detail: err.message }));
    });
    upstreamReq.end(body);
  });
}

// Synthetic SSE stream: emit TransactionProcessed for each pending tx once processed.
function handleEvents(req: http.IncomingMessage, res: http.ServerResponse) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write(":connected\n\n"); // first bytes so the watcher confirms the connection

  const tick = setInterval(async () => {
    res.write(":hb\n\n"); // heartbeat keeps the stream alive
    for (const hex of [...pending]) {
      try {
        const r = await rpc({
          jsonrpc: "2.0",
          id: 1,
          method: "info_get_transaction",
          params: { transaction_hash: { Version1: hex }, finalized_approvals: false },
        });
        const processed = r?.result?.execution_info?.execution_result;
        if (processed) {
          const event = { TransactionProcessed: { transaction_hash: { Version1: hex } } };
          res.write(`data:${JSON.stringify(event)}\n\n`);
          pending.delete(hex);
          console.log(`[bridge] emitted TransactionProcessed for ${hex}`);
        }
      } catch {
        // transient, try again next tick
      }
    }
  }, 1500);

  req.on("close", () => clearInterval(tick));
}

// Constant-time-ish check of the ?k= secret against PROXY_AUTH_TOKEN.
function authed(req: http.IncomingMessage): boolean {
  if (!AUTH) return true; // open when no token configured (local dev)
  const k = new URL(req.url ?? "", "http://x").searchParams.get("k") ?? "";
  if (k.length !== AUTH.length) return false;
  let diff = 0;
  for (let i = 0; i < AUTH.length; i += 1) diff |= k.charCodeAt(i) ^ AUTH.charCodeAt(i);
  return diff === 0;
}

// Start the bridge. Called directly when run as a CLI (npx tsx src/proxy.ts), or
// in-process by the Render server so the proxy stays private on localhost.
export function startProxy(): http.Server {
  if (!TOKEN) throw new Error("CSPR_CLOUD_KEY is required");
  const server = http.createServer((req, res) => {
    if (!authed(req)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "unauthorized" }));
    }
    if (req.method === "GET" && (req.url ?? "").startsWith("/events")) {
      return handleEvents(req, res);
    }
    return handleRpc(req, res);
  });
  server.listen(PORT, HOST, () => {
    console.log(`CSPR.cloud bridge: http://${HOST}:${PORT}/rpc (+ /events SSE) -> ${UPSTREAM.href}`);
    if (HOST !== "127.0.0.1" && !AUTH) {
      console.warn("[bridge] bound to a public interface with no PROXY_AUTH_TOKEN set; it's an open relay to CSPR.cloud under your key. Set PROXY_AUTH_TOKEN before exposing it.");
    }
  });
  return server;
}

// Run standalone when invoked directly, but not when imported by the server.
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  startProxy();
}
