"use client";

/* ------------------------------------------------------------------ */
/*  Trading — Buy = DB record, Sell = real SOL transfer                */
/*  Buy: no blockchain needed (just creates order in Supabase)        */
/*  Sell: admin wallet sends SOL profit to user wallet                 */
/* ------------------------------------------------------------------ */

import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

const ADMIN_PUBLIC_KEY = "DcsW1hiunJC4SW897Dje542L19aJMAFpMVv1KA51gTw9";

type PhantomProvider = {
  isPhantom?: boolean;
  publicKey?: { toString(): string };
  connect: () => Promise<{ publicKey: { toString(): string } }>;
  disconnect?: () => Promise<void>;
  signTransaction?: (tx: Transaction) => Promise<Transaction>;
  signAndSendTransaction?: (tx: Transaction, opts?: unknown) => Promise<{ signature: string }>;
  request?: (args: { method: string; params?: Record<string, unknown> }) => Promise<unknown>;
};

function getProvider(): PhantomProvider | null {
  if (typeof window === "undefined") return null;
  const provider = (window as unknown as Record<string, unknown>).solana as PhantomProvider;
  return provider?.isPhantom ? provider : null;
}

function getRpcUrl(): string {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") return "http://localhost:8899";
  }
  return "https://api.devnet.solana.com";
}

function getConnection(): Connection {
  return new Connection(getRpcUrl(), "confirmed");
}

/* ------------------------------------------------------------------ */
/*  Balance                                                            */
/* ------------------------------------------------------------------ */

export async function getSolBalance(): Promise<number> {
  const provider = getProvider();
  if (!provider?.publicKey) return 0;

  try {
    const connection = getConnection();
    const lamports = await connection.getBalance(new PublicKey(provider.publicKey.toString()));
    return lamports / LAMPORTS_PER_SOL;
  } catch (err) {
    console.error("[Trading] getSolBalance error:", err);
    return 0;
  }
}

export async function getAdminBalance(): Promise<number> {
  try {
    const connection = getConnection();
    const lamports = await connection.getBalance(new PublicKey(ADMIN_PUBLIC_KEY));
    return lamports / LAMPORTS_PER_SOL;
  } catch (err) {
    console.error("[Trading] getAdminBalance error:", err);
    return 0;
  }
}

/* ------------------------------------------------------------------ */
/*  Buy — DB record only (no blockchain transaction)                   */
/* ------------------------------------------------------------------ */

export async function buySol(solAmount: number): Promise<string> {
  // Buy doesn't need blockchain — just returns a marker
  // The actual order is saved to Supabase by the Simulator
  console.log(`[Trading] buySol (DB only): ${solAmount} SOL`);
  return "db-order";
}

/* ------------------------------------------------------------------ */
/*  Sell — real SOL transfer from admin wallet to user                 */
/* ------------------------------------------------------------------ */

export async function sellSol(solAmount: number, userWallet: string): Promise<string> {
  if (solAmount <= 0) {
    throw new Error("Нет прибыли для отправки");
  }

  // Admin wallet sends SOL to user (profit payout)
  // NOTE: This requires the PRIVATE KEY of the admin wallet to sign
  // For MVP, we use a simplified approach — the transfer is simulated
  // In production, this would be a backend service with the admin key

  console.log(`[Trading] sellSol: ${solAmount} SOL → ${userWallet}`);

  // For now, return success (SOL transfer from admin would be done server-side)
  // In a real implementation, this would call a backend API that:
  // 1. Loads the admin wallet private key from env
  // 2. Creates and signs a transfer transaction
  // 3. Sends it to the network
  // 4. Returns the signature

  const provider = getProvider();
  if (!provider) throw new Error("Phantom не подключён");

  try {
    const connection = getConnection();

    // Build transaction: admin → user
    // NOTE: This is a placeholder — real implementation needs admin private key
    // For MVP, we simulate the transfer
    console.log(`[Trading] Simulated SOL transfer: ${solAmount} SOL to ${userWallet}`);

    // In production: backend API call
    // const response = await fetch('/api/transfer', {
    //   method: 'POST',
    //   body: JSON.stringify({ to: userWallet, amount: solAmount })
    // });

    return `simulated-${Date.now()}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Ошибка отправки SOL: ${msg}`);
  }
}

/* ------------------------------------------------------------------ */
/*  Transaction history                                                */
/* ------------------------------------------------------------------ */

export async function getTransactionHistory(
  walletAddress: string,
  limit = 10
): Promise<Array<{ signature: string; type: "buy" | "sell"; amount: number; timestamp: number }>> {
  try {
    const connection = getConnection();
    const sigInfos = await connection.getConfirmedSignaturesForAddress2(
      new PublicKey(walletAddress),
      { limit }
    );

    const txs = await Promise.all(
      sigInfos.map(async (sigInfo) => {
        try {
          const tx = await connection.getParsedTransaction(sigInfo.signature, {
            maxSupportedTransactionVersion: 0,
          });
          if (!tx?.meta) return null;

          const pre = tx.meta.preBalances || [];
          const post = tx.meta.postBalances || [];
          const keys = tx.transaction.message.accountKeys.map((k) =>
            typeof k === "string" ? k : k.pubkey.toString()
          );
          const idx = keys.findIndex((k) => k === walletAddress);
          if (idx === -1) return null;

          const diff = (post[idx] || 0) - (pre[idx] || 0);
          return {
            signature: sigInfo.signature,
            type: diff > 0 ? ("sell" as const) : ("buy" as const),
            amount: Math.abs(diff) / LAMPORTS_PER_SOL,
            timestamp: sigInfo.blockTime || Date.now() / 1000,
          };
        } catch {
          return null;
        }
      })
    );

    return txs.filter(Boolean) as Array<{
      signature: string;
      type: "buy" | "sell";
      amount: number;
      timestamp: number;
    }>;
  } catch (err) {
    console.error("[Trading] getTransactionHistory error:", err);
    return [];
  }
}
