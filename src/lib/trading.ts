"use client";

/* ------------------------------------------------------------------ */
/*  Trading — SOL transfers via Phantom                                */
/*  Uses @solana/web3.js loaded from CDN at runtime                    */
/* ------------------------------------------------------------------ */

const ADMIN_PUBLIC_KEY = "DcsW1hiunJC4SW897Dje542L19aJMAFpMVv1KA51gTw9";
const CDN_URL = "https://unpkg.com/@solana/web3.js@latest/lib/index.iife.min.js";

type PhantomProvider = {
  isPhantom?: boolean;
  publicKey?: { toString: () => string };
  connect: () => Promise<{ publicKey: { toString: () => string } }>;
  disconnect?: () => Promise<void>;
  signTransaction?: (tx: unknown) => Promise<unknown>;
  signAndSendTransaction?: (tx: unknown, opts?: unknown) => Promise<{ signature: string }>;
  request?: (args: { method: string; params?: Record<string, unknown> }) => Promise<unknown>;
};

declare global {
  interface Window {
    SolanaWeb3?: unknown;
  }
}

function getProvider(): PhantomProvider | null {
  if (typeof window === "undefined") return null;
  const provider = (window as unknown as Record<string, unknown>).solana as PhantomProvider;
  return provider?.isPhantom ? provider : null;
}

function getRpcUrl(): string {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      return "http://localhost:8899";
    }
  }
  return "https://api.devnet.solana.com";
}

/* ------------------------------------------------------------------ */
/*  Load @solana/web3.js from CDN                                      */
/* ------------------------------------------------------------------ */

let _web3Loaded = false;
let _web3LoadPromise: Promise<void> | null = null;

async function loadWeb3(): Promise<typeof window.SolanaWeb3> {
  if (window.SolanaWeb3) return window.SolanaWeb3;
  if (_web3LoadPromise) {
    await _web3LoadPromise;
    return window.SolanaWeb3!;
  }

  _web3LoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = CDN_URL;
    script.onload = () => {
      _web3Loaded = true;
      resolve();
    };
    script.onerror = () => reject(new Error("Failed to load @solana/web3.js"));
    document.head.appendChild(script);
  });

  await _web3LoadPromise;
  return window.SolanaWeb3!;
}

/* ------------------------------------------------------------------ */
/*  Balance                                                            */
/* ------------------------------------------------------------------ */

export async function getSolBalance(): Promise<number> {
  const provider = getProvider();
  if (!provider?.publicKey) return 0;

  const walletAddress = provider.publicKey.toString();

  try {
    const response = await fetch(getRpcUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getBalance",
        params: [walletAddress],
      }),
    });

    const data = await response.json();
    if (data.result?.value !== undefined) {
      return data.result.value / 1e9;
    }
    return 0;
  } catch (err) {
    console.error("[Trading] getSolBalance error:", err);
    return 0;
  }
}

export async function getAdminBalance(): Promise<number> {
  try {
    const response = await fetch(getRpcUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getBalance",
        params: [ADMIN_PUBLIC_KEY],
      }),
    });

    const data = await response.json();
    if (data.result?.value !== undefined) {
      return data.result.value / 1e9;
    }
    return 0;
  } catch (err) {
    console.error("[Trading] getAdminBalance error:", err);
    return 0;
  }
}

/* ------------------------------------------------------------------ */
/*  SOL Transfer using @solana/web3.js from CDN                        */
/* ------------------------------------------------------------------ */

export async function buySol(solAmount: number): Promise<string> {
  const provider = getProvider();
  if (!provider) throw new Error("Phantom не подключён");
  if (!provider.publicKey) throw new Error("Кошелёк не подключён");

  const web3 = await loadWeb3() as Record<string, unknown>;
  const Connection = web3.Connection as new (endpoint: string, commitment?: string) => { getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }>; sendRawTransaction(serialized: Uint8Array): Promise<string> };
  const PublicKey = web3.PublicKey as new (key: string) => { toString(): string };
  const Transaction = web3.Transaction as new () => { recentBlockhash?: string; feePayer?: { toString(): string }; add(...args: unknown[]): void; serialize(): Uint8Array };
  const SystemProgram = web3.SystemProgram as { transfer(args: { fromPubkey: { toString(): string }; toPubkey: { toString(): string }; lamports: number }): unknown };
  const LAMPORTS_PER_SOL = web3.LAMPORTS_PER_SOL as number;

  const connection = new Connection(getRpcUrl(), "confirmed");
  const fromPubkey = new PublicKey(provider.publicKey.toString());
  const toPubkey = new PublicKey(ADMIN_PUBLIC_KEY);
  const lamports = Math.round(solAmount * LAMPORTS_PER_SOL);

  console.log(`[Trading] buySol: ${solAmount} SOL (${lamports} lamports)`);
  console.log(`[Trading] from: ${fromPubkey.toString()}`);
  console.log(`[Trading] to: ${toPubkey.toString()}`);

  // Build transaction
  const transaction = new Transaction();
  transaction.add(
    SystemProgram.transfer({
      fromPubkey,
      toPubkey,
      lamports,
    })
  );

  // Get recent blockhash
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = fromPubkey;

  console.log(`[Trading] Blockhash: ${blockhash}`);

  // Sign and send via Phantom
  try {
    // Method 1: signAndSendTransaction (preferred)
    if (provider.signAndSendTransaction) {
      console.log("[Trading] Using signAndSendTransaction...");
      const result = await provider.signAndSendTransaction(transaction, {
        skipPreflight: false,
        preflightCommitment: "processed",
      });
      console.log("[Trading] Transaction sent:", result.signature);
      return result.signature;
    }

    // Method 2: signTransaction then send manually
    if (provider.signTransaction) {
      console.log("[Trading] Using signTransaction...");
      const signed = await provider.signTransaction(transaction);
      const serialized = (signed as { serialize(): Uint8Array }).serialize();
      const signature = await connection.sendRawTransaction(serialized);
      console.log("[Trading] Transaction sent:", signature);
      return signature;
    }

    throw new Error("Phantom не поддерживает отправку трансакций");
  } catch (err) {
    console.error("[Trading] Transaction failed:", err);
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Трансакция отклонена: ${msg}`);
  }
}

export async function sellSol(solAmount: number, userWallet: string): Promise<string> {
  console.log(`[Trading] Sell request: ${solAmount} SOL to ${userWallet}`);

  // For MVP, record the sell intent
  return "sell-pending";
}

/* ------------------------------------------------------------------ */
/*  Transaction history                                                */
/* ------------------------------------------------------------------ */

export async function getTransactionHistory(
  walletAddress: string,
  limit: number = 10
): Promise<
  Array<{
    signature: string;
    type: "buy" | "sell";
    amount: number;
    timestamp: number;
  }>
> {
  try {
    const response = await fetch(getRpcUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getSignaturesForAddress",
        params: [walletAddress, { limit }],
      }),
    });

    const data = await response.json();
    const signatures = data.result?.value || [];

    const transactions = await Promise.all(
      signatures.map(async (sig: { signature: string; blockTime: number | null }) => {
        try {
          const txResponse = await fetch(getRpcUrl(), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "getTransaction",
              params: [
                sig.signature,
                { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
              ],
            }),
          });

          const txData = await txResponse.json();
          const tx = txData.result?.transaction;

          if (!tx?.meta) return null;

          const preBalances = tx.meta.preBalances || [];
          const postBalances = tx.meta.postBalances || [];

          const accountKeys = tx.transaction?.message?.accountKeys || [];
          const walletIndex = accountKeys.findIndex(
            (key: { pubkey?: string } | string) =>
              typeof key === "string" ? key === walletAddress : key?.pubkey === walletAddress
          );

          if (walletIndex === -1) return null;

          const balanceChange =
            (postBalances[walletIndex] || 0) - (preBalances[walletIndex] || 0);
          const amount = Math.abs(balanceChange) / 1e9;

          return {
            signature: sig.signature,
            type: balanceChange > 0 ? "sell" as const : "buy" as const,
            amount,
            timestamp: sig.blockTime || Date.now() / 1000,
          };
        } catch {
          return null;
        }
      })
    );

    return transactions.filter(Boolean) as Array<{
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
