"use client";

/* ------------------------------------------------------------------ */
/*  Trading — SOL transfers via Phantom                                */
/*  Uses @solana/web3.js loaded from public/solana-web3.min.js         */
/*  Phantom gets a real Transaction object it can sign & send           */
/* ------------------------------------------------------------------ */

const ADMIN_PUBLIC_KEY = "DcsW1hiunJC4SW897Dje542L19aJMAFpMVv1KA51gTw9";

type PhantomProvider = {
  isPhantom?: boolean;
  publicKey?: { toString(): string };
  connect: () => Promise<{ publicKey: { toString(): string } }>;
  disconnect?: () => Promise<void>;
  signTransaction?: (tx: unknown) => Promise<unknown>;
  signAndSendTransaction?: (tx: unknown, opts?: unknown) => Promise<{ signature: string }>;
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

/* ------------------------------------------------------------------ */
/*  Get @solana/web3.js from the global (loaded via <script> tag)       */
/* ------------------------------------------------------------------ */

function getWeb3() {
  const w = window as unknown as Record<string, unknown>;
  const solanaWeb3 = w.solanaWeb3 as Record<string, unknown> | undefined;
  if (!solanaWeb3) throw new Error("@solana/web3.js не загружен. Перезагрузите страницу.");
  return solanaWeb3;
}

/* ------------------------------------------------------------------ */
/*  Balance                                                            */
/* ------------------------------------------------------------------ */

export async function getSolBalance(): Promise<number> {
  const provider = getProvider();
  if (!provider?.publicKey) return 0;

  try {
    const response = await fetch(getRpcUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getBalance",
        params: [provider.publicKey.toString()],
      }),
    });
    const data = await response.json();
    if (data.result?.value !== undefined) return data.result.value / 1e9;
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
    if (data.result?.value !== undefined) return data.result.value / 1e9;
    return 0;
  } catch (err) {
    console.error("[Trading] getAdminBalance error:", err);
    return 0;
  }
}

/* ------------------------------------------------------------------ */
/*  Build & send SOL transfer using real @solana/web3.js                */
/* ------------------------------------------------------------------ */

export async function buySol(solAmount: number): Promise<string> {
  const provider = getProvider();
  if (!provider) throw new Error("Phantom не подключён");
  if (!provider.publicKey) throw new Error("Кошелёк не подключён");

  const web3 = getWeb3();

  const Connection = web3.Connection as new (...args: unknown[]) => {
    getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }>;
    sendRawTransaction(serialized: Uint8Array, options?: unknown): Promise<string>;
  };
  const PublicKey = web3.PublicKey as new (key: string) => unknown;
  const Transaction = web3.Transaction as new () => {
    recentBlockhash: string | null;
    feePayer: unknown;
    add(...instructions: unknown[]): void;
    serialize(): Uint8Array;
  };
  const SystemProgram = web3.SystemProgram as {
    transfer(args: { fromPubkey: unknown; toPubkey: unknown; lamports: number }): unknown;
  };
  const LAMPORTS_PER_SOL = web3.LAMPORTS_PER_SOL as number;

  const connection = new Connection(getRpcUrl(), "confirmed");
  const fromPubkey = new PublicKey(provider.publicKey.toString());
  const toPubkey = new PublicKey(ADMIN_PUBLIC_KEY);
  const lamports = Math.round(solAmount * LAMPORTS_PER_SOL);

  console.log(`[Trading] buySol: ${solAmount} SOL (${lamports} lamports)`);
  console.log(`[Trading] from: ${provider.publicKey.toString()}`);
  console.log(`[Trading] to: ${ADMIN_PUBLIC_KEY}`);

  // Build Transaction with SystemProgram.transfer
  const transaction = new Transaction();
  transaction.add(
    SystemProgram.transfer({
      fromPubkey,
      toPubkey,
      lamports,
    })
  );

  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = fromPubkey;

  console.log(`[Trading] tx built, blockhash: ${blockhash}`);

  // Sign and send via Phantom
  try {
    if (provider.signAndSendTransaction) {
      console.log("[Trading] signAndSendTransaction...");
      const result = await provider.signAndSendTransaction(transaction, {
        skipPreflight: false,
        preflightCommitment: "processed",
      });
      console.log("[Trading] ✅ Sent:", result.signature);
      return result.signature;
    }

    if (provider.request) {
      console.log("[Trading] request API fallback...");
      const serialized = transaction.serialize();
      const result = (await provider.request({
        method: "solana_signAndSendTransaction",
        params: {
          transaction: btoa(String.fromCharCode(...serialized)),
          chain: "solana:devnet",
        },
      })) as { signature: string };
      console.log("[Trading] ✅ Sent:", result.signature);
      return result.signature;
    }

    throw new Error("Phantom не поддерживает отправку трансакций");
  } catch (err) {
    console.error("[Trading] ❌ Failed:", err);
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Транзакция отклонена: ${msg}`);
  }
}

/* ------------------------------------------------------------------ */
/*  Sell (MVP placeholder)                                             */
/* ------------------------------------------------------------------ */

export async function sellSol(solAmount: number, _userWallet: string): Promise<string> {
  console.log(`[Trading] Sell request: ${solAmount} SOL`);
  return "sell-pending";
}

/* ------------------------------------------------------------------ */
/*  Transaction history                                                */
/* ------------------------------------------------------------------ */

export async function getTransactionHistory(
  walletAddress: string,
  limit = 10
): Promise<Array<{ signature: string; type: "buy" | "sell"; amount: number; timestamp: number }>> {
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
    const sigs = data.result?.value || [];

    const txs = await Promise.all(
      sigs.map(async (sig: { signature: string; blockTime: number | null }) => {
        try {
          const r = await fetch(getRpcUrl(), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "getTransaction",
              params: [sig.signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }],
            }),
          });
          const d = await r.json();
          const tx = d.result?.transaction;
          if (!tx?.meta) return null;

          const pre = tx.meta.preBalances || [];
          const post = tx.meta.postBalances || [];
          const keys = tx.transaction?.message?.accountKeys || [];
          const idx = keys.findIndex(
            (k: { pubkey?: string } | string) =>
              typeof k === "string" ? k === walletAddress : k?.pubkey === walletAddress
          );
          if (idx === -1) return null;

          const diff = (post[idx] || 0) - (pre[idx] || 0);
          return {
            signature: sig.signature,
            type: diff > 0 ? ("sell" as const) : ("buy" as const),
            amount: Math.abs(diff) / 1e9,
            timestamp: sig.blockTime || Date.now() / 1000,
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
