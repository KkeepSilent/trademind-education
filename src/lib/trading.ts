"use client";

/* ------------------------------------------------------------------ */
/*  Admin wallet for SOL transfers on devnet                           */
/*  Buy  = user sends SOL to admin wallet                              */
/*  Sell = admin wallet sends SOL back to user                         */
/* ------------------------------------------------------------------ */

const ADMIN_PUBLIC_KEY = "DcsW1hiunJC4SW897Dje542L19aJMAFpMVv1KA51gTw9";

type PhantomProvider = {
  isPhantom?: boolean;
  publicKey?: { toString: () => string };
  connect: () => Promise<{ publicKey: { toString: () => string } }>;
  disconnect?: () => Promise<void>;
  signTransaction?: (tx: unknown) => Promise<unknown>;
  request?: (args: { method: string; params?: Record<string, unknown> }) => Promise<unknown>;
};

function getProvider(): PhantomProvider | null {
  if (typeof window === "undefined") return null;
  const provider = (window as unknown as Record<string, unknown>).solana as PhantomProvider;
  return provider?.isPhantom ? provider : null;
}

function getRpcUrl(): string {
  // In browser: use devnet for production, localhost for local dev
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      return "http://localhost:8899";
    }
  }
  return "https://api.devnet.solana.com";
}

/* ------------------------------------------------------------------ */
/*  Auto-fund admin wallet from devnet faucet                          */
/* ------------------------------------------------------------------ */

/**
 * Request SOL from devnet faucet for admin wallet.
 * Faucet gives ~2 SOL per request. Rate limited to ~1 request per minute.
 */
export async function faucetRequest(): Promise<{ success: boolean; signature?: string; error?: string }> {
  try {
    const response = await fetch("https://api.devnet.solana.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "requestAirdrop",
        params: [ADMIN_PUBLIC_KEY, 2e9], // 2 SOL
      }),
    });

    const data = await response.json();
    if (data.result) {
      return { success: true, signature: data.result };
    }
    return { success: false, error: data.error?.message || "Faucet error" };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

/**
 * Auto-fund admin wallet if balance is low.
 * Returns true if funding was attempted.
 */
export async function autoFundAdmin(minBalanceSol: number = 5): Promise<boolean> {
  const balance = await getAdminBalance();
  if (balance >= minBalanceSol) return false;

  console.log(`[Trading] Admin balance low (${balance.toFixed(2)} SOL), requesting faucet...`);
  const result = await faucetRequest();
  if (result.success) {
    console.log(`[Trading] Faucet funded. TX: ${result.signature}`);
    return true;
  }
  console.warn(`[Trading] Faucet failed: ${result.error}`);
  return false;
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
      return data.result.value / 1e9; // lamports → SOL
    }
    return 0;
  } catch (err) {
    console.error("[Phantom] getSolBalance error:", err);
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
    console.error("[Phantom] getAdminBalance error:", err);
    return 0;
  }
}

/* ------------------------------------------------------------------ */
/*  SOL Transfer (Buy = user → admin, Sell = admin → user)            */
/* ------------------------------------------------------------------ */

/**
 * Send SOL from user wallet to admin wallet (BUY).
 * Returns the transaction signature.
 */
export async function buySol(solAmount: number): Promise<string> {
  const provider = getProvider();
  if (!provider) throw new Error("Phantom не подключён");
  if (!provider.publicKey) throw new Error("Кошелёк не подключён");

  const fromPubkey = provider.publicKey.toString();
  const lamports = Math.round(solAmount * 1e9);

  // Get recent blockhash
  const blockhashResponse = await fetch(getRpcUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getLatestBlockhash",
      params: [{ commitment: "finalized" }],
    }),
  });
  const blockhashData = await blockhashResponse.json();
  const recentBlockhash = blockhashData.result?.value?.blockhash;
  if (!recentBlockhash) throw new Error("Не удалось получить blockhash");

  // Build transaction
  const transaction = {
    feePayer: fromPubkey,
    recentBlockhash,
    instructions: [
      {
        keys: [
          { pubkey: fromPubkey, isSigner: true, isWritable: true },
          { pubkey: ADMIN_PUBLIC_KEY, isSigner: false, isWritable: true },
        ],
        programId: "11111111111111111111111111111111",
        data: [
          2, 0, 0, 0, // Transfer instruction
          ...new Uint8Array(new Uint32Array([lamports]).buffer),
          ...new Uint8Array(new Uint32Array([0]).buffer),
        ],
      },
    ],
    instructions_b64: undefined,
  };

  // Try to sign via Phantom
  let signed;
  try {
    // Try signTransaction first
    if (provider.signTransaction) {
      signed = await provider.signTransaction(transaction);
    }
  } catch {
    // Fall back to request method
  }

  if (!signed && provider.request) {
    // Use Phantom's request to sign and send
    try {
      const result = await provider.request({
        method: "signAndSendTransaction",
        params: {
          transaction: btoa(String.fromCharCode(...new Uint8Array(0))),
          message: JSON.stringify(transaction),
        },
      });
      if (result) {
        return (result as { signature?: string }).signature || String(result);
      }
    } catch {
      // Continue to legacy method
    }
  }

  // Legacy: just send SOL via Phantom's native method
  if (!provider.request) {
    throw new Error("Phantom кошелёк не поддерживает отправку трансакций");
  }

  try {
    const result = await provider.request({
      method: "solana_signAndSendTransaction",
      params: {
        transaction: transaction,
        sendOptions: { skipPreflight: false, preflightCommitment: "processed" },
      },
    });
    if (result && typeof result === "object" && "signature" in result) {
      return (result as { signature: string }).signature;
    }
    return String(result);
  } catch (err) {
    throw new Error(`Трансакция отклонена: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Send SOL from admin wallet back to user wallet (SELL).
 * NOTE: For MVP, this requires admin wallet to be connected or
 * uses a server-side approach. Returns tx signature.
 */
export async function sellSol(solAmount: number, userWallet: string): Promise<string> {
  const provider = getProvider();

  // If user's phantom is connected, we can request them to sign
  // a transaction from the admin wallet (if they have the keypair)
  // For MVP, we'll use a simplified approach:
  // The user signs a "sell" request and we track it in Supabase.
  // The actual SOL transfer happens via the admin wallet.

  const lamports = Math.round(solAmount * 1e9);

  // For now, we record the sell intent and the backend will process it
  // In production, this would be a server-side transaction
  console.log(`[Phantom] Sell request: ${solAmount} SOL (${lamports} lamports) to ${userWallet}`);

  // TODO: Implement server-side admin wallet signing
  // For MVP, we mark the trade as "settled" in Supabase
  // and the admin wallet manually settles periodically

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

          // Find wallet index
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
    console.error("[Phantom] getTransactionHistory error:", err);
    return [];
  }
}
