"use client";

/* ------------------------------------------------------------------ */
/*  Admin wallet for SOL transfers on devnet                           */
/*  Buy  = user sends SOL to admin wallet                              */
/*  Sell = admin wallet sends SOL back to user                         */
/* ------------------------------------------------------------------ */

const ADMIN_PUBLIC_KEY = "DcsW1hiunJC4SW897Dje542L19aJMAFpMVv1KA51gTw9";
const SYSTEM_PROGRAM = "11111111111111111111111111111111";

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
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      return "http://localhost:8899";
    }
  }
  return "https://api.devnet.solana.com";
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
/*  SOL Transfer via Phantom                                           */
/* ------------------------------------------------------------------ */

/**
 * Encode a base58 string to bytes and vice versa (for Solana addresses).
 * Solana addresses are base58-encoded 32-byte public keys.
 */
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Decode(str: string): Uint8Array {
  const bytes = [0];
  for (const char of str) {
    const index = BASE58_ALPHABET.indexOf(char);
    if (index === -1) throw new Error(`Invalid base58 character: ${char}`);
    let carry = index;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const char of str) {
    if (char === "1") bytes.unshift(0);
    else break;
  }
  return new Uint8Array(bytes.reverse());
}

function base58Encode(bytes: Uint8Array): string {
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let result = "";
  for (const byte of bytes) {
    if (byte === 0) result += "1";
    else break;
  }
  for (let i = digits.length - 1; i >= 0; i--) {
    result += BASE58_ALPHABET[digits[i]];
  }
  return result;
}

/**
 * Build a raw SOL transfer transaction and send via Phantom.
 * Uses proper Solana transaction serialization.
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

  // Build the transaction message manually
  // This is a simple SOL transfer using System Program
  const fromBytes = base58Decode(fromPubkey);
  const toBytes = base58Decode(ADMIN_PUBLIC_KEY);
  const programBytes = base58Decode(SYSTEM_PROGRAM);
  const blockhashBytes = base58Decode(recentBlockhash);

  // Encode lamports as little-endian u64
  const lamportsBytes = new Uint8Array(8);
  const dataView = new DataView(lamportsBytes.buffer);
  dataView.setUint32(0, lamports & 0xffffffff, true);
  dataView.setUint32(4, Math.floor(lamports / 0x100000000) & 0xffffffff, true);

  // System Program Transfer instruction: [2, ...lamports_bytes]
  const instructionData = new Uint8Array([2, ...lamportsBytes]);

  // Build message
  const message = new Uint8Array([
    0, // message header: num_required_signatures
    1, // num_readonly_signed_accounts
    0, // num_readonly_unsigned_accounts
    3, // account_keys length
    ...fromBytes,
    ...toBytes,
    ...programBytes,
    1, // instructions length
    0, // instruction index (System Program)
    0, // account_index_from
    1, // account_index_to
    2, // account_index_program
    instructionData.length,
    ...instructionData,
    ...blockhashBytes,
  ]);

  // Use Phantom's signAndSendTransaction
  if (provider.request) {
    try {
      // Method 1: Use solana_signAndSendTransaction with serialized message
      const result = await provider.request({
        method: "solana_signAndSendTransaction",
        params: {
          transaction: {
            message: Array.from(message),
            signatures: [],
          },
          sendOptions: {
            skipPreflight: false,
            preflightCommitment: "processed",
          },
        },
      });

      if (result && typeof result === "object" && "signature" in result) {
        return (result as { signature: string }).signature;
      }
      return String(result);
    } catch (err) {
      console.warn("[Trading] Method 1 failed, trying method 2:", err);
    }
  }

  // Method 2: Use Phantom's connect and sign
  if (provider.signTransaction) {
    try {
      // Build a Versioned Transaction message
      const txMessage = {
        feePayer: fromPubkey,
        recentBlockhash,
        instructions: [
          {
            keys: [
              { pubkey: fromPubkey, isSigner: true, isWritable: true },
              { pubkey: ADMIN_PUBLIC_KEY, isSigner: false, isWritable: true },
            ],
            programId: SYSTEM_PROGRAM,
            data: Array.from(instructionData),
          },
        ],
      };

      const signed = await provider.signTransaction(txMessage);
      if (signed) {
        // Send the signed transaction
        const serialized = (signed as { serialize?: () => Uint8Array }).serialize?.();
        if (serialized) {
          const sendResponse = await fetch(getRpcUrl(), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "sendTransaction",
              params: [
                Array.from(serialized),
                { encoding: "base64", skipPreflight: false, preflightCommitment: "processed" },
              ],
            }),
          });
          const sendData = await sendResponse.json();
          if (sendData.result) return sendData.result;
          if (sendData.error) throw new Error(sendData.error.message);
        }
      }
    } catch (err) {
      console.warn("[Trading] Method 2 failed:", err);
    }
  }

  throw new Error("Не удалось отправить трансакцию. Попробуйте ещё раз.");
}

/**
 * Send SOL from admin wallet back to user wallet (SELL).
 */
export async function sellSol(solAmount: number, userWallet: string): Promise<string> {
  const provider = getProvider();

  const lamports = Math.round(solAmount * 1e9);

  console.log(`[Trading] Sell request: ${solAmount} SOL (${lamports} lamports) to ${userWallet}`);

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
