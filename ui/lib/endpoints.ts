// Where the orchestrator's write/run endpoints live.
//
// The live panel run takes minutes, which a Vercel Hobby function (60s cap)
// can't hold, so in the cloud those endpoints run on a long-lived host (Render)
// and NEXT_PUBLIC_ORCHESTRATOR_URL points at it. Unset (local dev) falls back to
// the same-origin Next routes.
const BASE = (process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ?? "").replace(/\/$/, "");

export const runUrl = BASE ? `${BASE}/claim/run` : "/api/claim/run";
export const submitUrl = BASE ? `${BASE}/claim/submit` : "/api/registry/submit";
