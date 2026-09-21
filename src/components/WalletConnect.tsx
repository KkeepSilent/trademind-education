"use client";

import { useState } from "react";
import { Wallet, ExternalLink, LogOut, Loader2 } from "lucide-react";
import {
  connectPhantomWallet,
  disconnectPhantomWallet,
  getSolBalance,
} from "@/lib/phantom";
import { upsertWalletUser } from "@/lib/supabase";

type WalletConnectProps = {
  walletAddress: string | null;
  onConnect: (address: string) => void;
  onDisconnect: () => void;
};

export function WalletConnect({
  walletAddress,
  onConnect,
  onDisconnect,
}: WalletConnectProps) {
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);

  async function handleConnect() {
    setLoading(true);
    try {
      const address = await connectPhantomWallet();

      // Get real devnet balance
      const bal = await getSolBalance();
      setBalance(bal);

      // Save to Supabase
      await upsertWalletUser(address, bal);

      onConnect(address);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Не удалось подключить кошелёк.";
      alert(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    setLoading(true);
    try {
      await disconnectPhantomWallet();
      setBalance(null);
      onDisconnect();
    } catch (error) {
      console.error("Disconnect error:", error);
    } finally {
      setLoading(false);
    }
  }

  async function refreshBalance() {
    const bal = await getSolBalance();
    setBalance(bal);
    if (walletAddress) {
      await upsertWalletUser(walletAddress, bal);
    }
  }

  if (walletAddress) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-ink/10 bg-white px-3 py-2 text-sm">
        <span className="h-2.5 w-2.5 rounded-full bg-mint" />
        <button
          onClick={refreshBalance}
          className="font-medium hover:underline"
          title="Обновить баланс"
          type="button"
        >
          {walletAddress.slice(0, 4)}...{walletAddress.slice(-4)}
        </button>
        {balance !== null && (
          <span className="rounded bg-paper px-2 py-0.5 text-xs font-semibold text-steel">
            {balance.toFixed(4)} SOL
          </span>
        )}
        <a
          href={`https://explorer.solana.com/address/${walletAddress}?cluster=devnet`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-steel hover:text-ink transition"
          title="Открыть в Explorer"
        >
          <ExternalLink size={15} />
        </a>
        <button
          onClick={handleDisconnect}
          disabled={loading}
          className="text-coral hover:text-ink transition disabled:opacity-50"
          title="Отключить кошелёк"
        >
          {loading ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <LogOut size={15} />
          )}
        </button>
      </div>
    );
  }

  return (
    <button
      className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-steel disabled:opacity-50"
      disabled={loading}
      onClick={handleConnect}
      type="button"
    >
      {loading ? (
        <Loader2 size={18} className="animate-spin" />
      ) : (
        <Wallet size={18} />
      )}
      Connect Phantom
      <ExternalLink size={15} />
    </button>
  );
}
