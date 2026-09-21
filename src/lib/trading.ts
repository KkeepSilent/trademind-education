"use client";

/* ------------------------------------------------------------------ */
/*  Trading — SOL transfers via Phantom                                */
/*  Pure manual serialization, no @solana/web3.js needed               */
/*  Uses Phantom's request API: solana_signAndSendTransaction           */
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
/*  Base58 encode/decode                                               */
/* ------------------------------------------------------------------ */

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

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
    result += B58[digits[i]];
  }
  return result;
}

function base58Decode(str: string): Uint8Array {
  const bytes = [0];
  for (const char of str) {
    const idx = B58.indexOf(char);
    if (idx === -1) throw new Error(`Invalid base58: ${char}`);
    let carry = idx;
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

/* ------------------------------------------------------------------ */
/*  Base64 encode                                                      */
/* ------------------------------------------------------------------ */

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function toBase64(bytes: Uint8Array): string {
  let result = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const t = (b0 << 16) | (b1 << 8) | b2;
    result += B64[(t >> 18) & 63];
    result += B64[(t >> 12) & 63];
    result += i + 1 < bytes.length ? B64[(t >> 6) & 63] : "=";
    result += i + 2 < bytes.length ? B64[t & 63] : "=";
  }
  return result;
}

/* ------------------------------------------------------------------ */
/*  Compact unsigned short (Solana encoding)                            */
/*  < 0xFD → 1 byte; else 0xFD + 2 bytes LE                           */
/* ------------------------------------------------------------------ */

function compactU16(n: number): number[] {
  if (n < 0xfd) return [n];
  return [0xfd, n & 0xff, (n >> 8) & 0xff];
}

/* ------------------------------------------------------------------ */
/*  Balance via RPC                                                    */
/* ------------------------------------------------------------------ */

export async function getSolBalance(): Promise<number> {
  const provider = getProvider();
  if (!provider?.publicKey) return 0;

  try {
    const resp = await fetch(getRpcUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getBalance",
        params: [provider.publicKey.toString()],
      }),
    });
    const data = await resp.json();
    return (data.result?.value ?? 0) / 1e9;
  } catch (err) {
    console.error("[Trading] getSolBalance error:", err);
    return 0;
  }
}

export async function getAdminBalance(): Promise<number> {
  try {
    const resp = await fetch(getRpcUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getBalance",
        params: [ADMIN_PUBLIC_KEY],
      }),
    });
    const data = await resp.json();
    return (data.result?.value ?? 0) / 1e9;
  } catch (err) {
    console.error("[Trading] getAdminBalance error:", err);
    return 0;
  }
}

/* ------------------------------------------------------------------ */
/*  Build serialized transaction for Phantom request API                */
/*                                                                    */
/*  Solana transaction wire format:                                    */
/*    [num_required_signatures: 1]                                     */
/*    [num_readonly_signed: 1]                                         */
/*    [num_readonly_unsigned: 1]                                       */
/*    [account_0_pubkey: 32]                                           */
/*    ...                                                              */
/*    [recent_blockhash: 32]                                           */
/*    [instructions_count: compact_u16]                                */
/*    [instruction_0: ...]                                             */
/*                                                                    */
/*  Full serialized tx (what Phantom expects):                         */
/*    [num_sigs: 1]  (how many signatures to expect)                  */
/*    [sig_placeholder: 64 * num_sigs]  (empty = all zeros)           */
/*    [message_bytes: ...]                                             */
/* ------------------------------------------------------------------ */

function buildSerializedTransaction(
  fromPubkey: Uint8Array,
  toPubkey: Uint8Array,
  lamports: number,
  blockhash: string,
  blockhashBytes: Uint8Array
): Uint8Array {
  const SYSTEM_PROGRAM = base58Decode("11111111111111111111111111111111");

  // --- Message ---
  const msg: number[] = [];

  // Header
  msg.push(1); // num_required_signatures
  msg.push(0); // num_readonly_signed_accounts
  msg.push(1); // num_readonly_unsigned_accounts (system program)

  // Account keys: [from, to, system_program]
  for (let i = 0; i < 32; i++) msg.push(fromPubkey[i]);
  for (let i = 0; i < 32; i++) msg.push(toPubkey[i]);
  for (let i = 0; i < 32; i++) msg.push(SYSTEM_PROGRAM[i]);

  // Recent blockhash
  for (let i = 0; i < 32; i++) msg.push(blockhashBytes[i]);

  // Instructions compact array: 1 instruction
  msg.push(...compactU16(1));

  // Instruction: System Program Transfer
  msg.push(2); // program_id_index = 2 (system program)
  msg.push(...compactU16(2)); // account_indices count = 2
  msg.push(0); // from
  msg.push(1); // to

  // Instruction data: 4 bytes (instruction=2 LE) + 8 bytes (lamports LE)
  const ixData = new Uint8Array(12);
  ixData[0] = 2; // Transfer instruction
  for (let i = 0; i < 8; i++) {
    ixData[4 + i] = (lamports >> (i * 8)) & 0xff;
  }
  msg.push(...compactU16(ixData.length));
  for (let i = 0; i < ixData.length; i++) msg.push(ixData[i]);

  // --- Full serialized transaction ---
  // [num_sigs = 1] [empty signature (64 zeros)] [message]
  const messageBytes = new Uint8Array(msg);
  const tx = new Uint8Array(1 + 64 + messageBytes.length);
  tx[0] = 1; // 1 signature required
  // bytes 1-64 = zeros (placeholder for the signature)
  tx.set(messageBytes, 65);

  return tx;
}

/* ------------------------------------------------------------------ */
/*  SOL Transfer                                                       */
/* ------------------------------------------------------------------ */

export async function buySol(solAmount: number): Promise<string> {
  const provider = getProvider();
  if (!provider) throw new Error("Phantom не подключён");
  if (!provider.publicKey) throw new Error("Кошелёк не подключён");

  const fromAddress = provider.publicKey.toString();
  const fromPubkey = base58Decode(fromAddress);
  const toPubkey = base58Decode(ADMIN_PUBLIC_KEY);

  const LAMPORTS = 1_000_000_000;
  const lamports = Math.round(solAmount * LAMPORTS);

  console.log(`[Trading] buySol: ${solAmount} SOL (${lamports} lamports)`);
  console.log(`[Trading] from: ${fromAddress}`);
  console.log(`[Trading] to: ${ADMIN_PUBLIC_KEY}`);

  // 1. Get recent blockhash
  const rpcResp = await fetch(getRpcUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getLatestBlockhash",
      params: [{ commitment: "finalized" }],
    }),
  });
  const rpcData = await rpcResp.json();
  if (rpcData.error) {
    throw new Error(`RPC error: ${rpcData.error.message}`);
  }
  const blockhash = rpcData.result.value.blockhash;
  const blockhashBytes = base58Decode(blockhash);
  console.log(`[Trading] blockhash: ${blockhash}`);

  // 2. Build serialized transaction
  const serializedTx = buildSerializedTransaction(
    fromPubkey,
    toPubkey,
    lamports,
    blockhash,
    blockhashBytes
  );

  const txBase64 = toBase64(serializedTx);
  console.log(`[Trading] tx size: ${serializedTx.length} bytes`);
  console.log(`[Trading] tx base64 (first 80): ${txBase64.substring(0, 80)}...`);

  // 3. Send via Phantom's request API
  try {
    if (provider.request) {
      console.log("[Trading] Calling Phantom request API: solana_signAndSendTransaction");
      const result = await provider.request({
        method: "solana_signAndSendTransaction",
        params: {
          transaction: txBase64,
          chain: "solana:devnet",
          options: {
            skipPreflight: false,
            preflightCommitment: "processed",
          },
        },
      });
      const sig = (result as { signature: string }).signature;
      console.log("[Trading] ✅ Transaction sent:", sig);
      return sig;
    }

    // Fallback: try signAndSendTransaction with raw bytes
    if (provider.signAndSendTransaction) {
      console.log("[Trading] Fallback: signAndSendTransaction...");
      const result = await provider.signAndSendTransaction(
        { serialize: () => serializedTx } as unknown,
        { skipPreflight: false, preflightCommitment: "processed" }
      );
      console.log("[Trading] ✅ Transaction sent:", result.signature);
      return result.signature;
    }

    throw new Error("Phantom не поддерживает отправку трансакций");
  } catch (err) {
    console.error("[Trading] ❌ Transaction failed:", err);
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
    const resp = await fetch(getRpcUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getSignaturesForAddress",
        params: [walletAddress, { limit }],
      }),
    });
    const data = await resp.json();
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
