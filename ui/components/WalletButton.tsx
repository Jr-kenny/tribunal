"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icon";

// Real connect to the Casper Wallet browser extension (the same provider CSPR.click
// drives under the hood). CSPR.click's UI kit pegs React 18 + styled-components 5,
// which conflicts with this app's React 19, so we talk to the wallet provider
// directly: a genuine connection, no fake state.
type CasperProvider = {
  requestConnection: () => Promise<boolean>;
  getActivePublicKey: () => Promise<string>;
  disconnectFromSite: () => Promise<boolean>;
};

declare global {
  interface Window {
    CasperWalletProvider?: () => CasperProvider;
  }
}

const short = (k: string) => `${k.slice(0, 6)}…${k.slice(-4)}`;

export function WalletButton() {
  const [address, setAddress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // reflect an already-connected session if the extension exposes one
    const p = window.CasperWalletProvider?.();
    if (!p) return;
    p.getActivePublicKey()
      .then((k) => k && setAddress(k))
      .catch(() => {});
  }, []);

  async function connect() {
    const make = window.CasperWalletProvider;
    if (!make) {
      window.open("https://www.casperwallet.io/", "_blank", "noreferrer");
      return;
    }
    setBusy(true);
    try {
      const p = make();
      if (address) {
        await p.disconnectFromSite();
        setAddress(null);
      } else {
        const ok = await p.requestConnection();
        if (ok) setAddress(await p.getActivePublicKey());
      }
    } catch {
      // user rejected or extension error: leave state unchanged
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="btn" style={{ padding: "8px 14px", fontSize: 13 }} onClick={connect} disabled={busy}>
      <Icon name="wallet" size={15} />
      {address ? short(address) : "Connect wallet"}
    </button>
  );
}
