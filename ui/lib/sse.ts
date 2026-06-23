import type { StreamEvent } from "./types";
import { runUrl } from "./endpoints";

// POST a claim run and parse the SSE response, invoking onEvent per event.
export async function runClaim(
  body: { claimKey?: string; evidence?: string },
  onEvent: (e: StreamEvent) => void,
): Promise<void> {
  const res = await fetch(runUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const msg = await res.text().catch(() => "");
    onEvent({ type: "error", message: msg || `request failed (${res.status})` });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const line = chunk.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      try {
        onEvent(JSON.parse(line.slice(5).trim()) as StreamEvent);
      } catch {
        // ignore malformed chunk
      }
    }
  }
}
