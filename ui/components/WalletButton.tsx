"use client";

import { useState } from "react";
import { Icon } from "./Icon";

// Placeholder wallet affordance. CSPR.click integration lands in its own task;
// until then this is a non-blocking connect button so the layout is complete.
export function WalletButton() {
  const [connected, setConnected] = useState(false);
  return (
    <button
      className="btn"
      style={{ padding: "8px 14px", fontSize: 13 }}
      onClick={() => setConnected((c) => !c)}
    >
      <Icon name="wallet" size={15} />
      {connected ? "0x12…ab • Connected" : "Connect wallet"}
    </button>
  );
}
