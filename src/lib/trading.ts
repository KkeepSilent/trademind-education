"use client";

/* ------------------------------------------------------------------ */
/*  Trading — SOL transfers via Phantom                                */
/*  Uses @solana/web3.js (npm)                                         */
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
/*  SOL Transfer                                                       */
/* ------------------------------------------------------------------ */

export async function buySol(solAmount: number): Promise<string> {
  const provider = getProvider();
  if (!provider) throw new Error("Phantom не подключён");
  if (!provider.publicKey) throw new Error("Кошелёк не подключён");

  const connection = getConnection();
  const fromPubkey = new PublicKey(provider.publicKey.toString());
  const toPubkey = new PublicKey(ADMIN_PUBLIC_KEY);
  const lamports = Math.round(solAmount * LAMPORTS_PER_SOL);

  console.log(`[Trading] buySol: ${solAmount} SOL (${lamports} lamports)`);
  console.log(`[Trading] from: ${fromPubkey.toString()}`);
  console.log(`[Trading] to: ${ADMIN_PUBLIC_KEY}`);

  // Get fresh blockhash — use "confirmed" (finalized is too old on devnet)
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  console.log(`[Trading] blockhash: ${blockhash}, lastValidBlockHeight: ${lastValidBlockHeight}`);

  // Build transaction
  const transaction = new Transaction();
  transaction.feePayer = fromPubkey;
  transaction.recentBlockhash = blockhash;
  transaction.add(
    SystemProgram.transfer({
      fromPubkey,
      toPubkey,
      lamports,
    })
  );

  // Sign with Phantom
  let signedTransaction: Transaction;
  try {
    if (provider.signTransaction) {
      console.log("[Trading] Phantom: signTransaction...");
      signedTransaction = await provider.signTransaction(transaction);
    } else if (provider.signAndSendTransaction) {
      console.log("[Trading] Phantom: signAndSendTransaction...");
      const result = await provider.signAndSendTransaction(transaction, {
        skipPreflight: true,
      });
      console.log("[Trading] ✅ Sent:", result.signature);
      return result.signature;
    } else if (provider.request) {
      console.log("[Trading] Phantom: request API...");
      const serializedTx = transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });
      const result = (await provider.request({
        method: "solana_signAndSendTransaction",
        params: {
          transaction: Buffer.from(serializedTx).toString("base64"),
          chain: "solana:devnet",
          options: { skipPreflight: true },
        },
      })) as { signature: string };
      console.log("[Trading] ✅ Sent:", result.signature);
      return result.signature;
    } else {
      throw new Error("Phantom не поддерживает отправку транзакций");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // If blockhash expired during popup, retry once
    if (msg.includes("expired") || msg.includes("blockhash")) {
      console.log("[Trading] Blockhash expired during signing, retrying...");
      return buySol(solAmount); // Recursive retry with fresh blockhash
    }
    throw new Error(`Транзакция отклонена: ${msg}`);
  }

  // Send via RPC (Phantom only signed, didn't send)
  try {
    console.log("[Trading] Sending signed tx via RPC...");
    const rawTx = signedTransaction.serialize();
    console.log(`[Trading] Raw tx size: ${rawTx.length} bytes`);

    const signature = await connection.sendRawTransaction(rawTx, {
      skipPreflight: true,
      maxRetries: 3,
    });

    console.log("[Trading] ✅ Sent:", signature);
    return signature;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Ошибка отправки: ${msg}`);
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
