"use client";

/* ------------------------------------------------------------------ */
/*  Trading — SOL transfers via Phantom                                */
/*  Pure browser: Solana transactions serialized manually              */
/*  No @solana/web3.js needed                                          */
/* ------------------------------------------------------------------ */

const ADMIN_PUBLIC_KEY = "DcsW1hiunJC4SW897Dje542L19aJMAFpMVv1KA51gTw9";

type PhantomProvider = {
  isPhantom?: boolean;
  publicKey?: { toString: () => string };
  connect: () => Promise<{ publicKey: { toString: () => string } }>;
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
    if (host === "localhost" || host === "127.0.0.1") {
      return "http://localhost:8899";
    }
  }
  return "https://api.devnet.solana.com";
}

/* ------------------------------------------------------------------ */
/*  Base58 encode/decode                                               */
/* ------------------------------------------------------------------ */

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

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

/* ------------------------------------------------------------------ */
/*  Base64 encode (pure JS, no btoa needed)                            */
/* ------------------------------------------------------------------ */

const B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64Encode(bytes: Uint8Array): string {
  let result = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triplet = (b0 << 16) | (b1 << 8) | b2;
    result += B64_CHARS[(triplet >> 18) & 0x3f];
    result += B64_CHARS[(triplet >> 12) & 0x3f];
    result += i + 1 < bytes.length ? B64_CHARS[(triplet >> 6) & 0x3f] : "=";
    result += i + 2 < bytes.length ? B64_CHARS[triplet & 0x3f] : "=";
  }
  return result;
}

/* ------------------------------------------------------------------ */
/*  Address <-> bytes                                                  */
/* ------------------------------------------------------------------ */

function addressToBytes(address: string): Uint8Array {
  return base58Decode(address);
}

/* ------------------------------------------------------------------ */
/*  Compact encode (for Solana compact arrays)                         */
/*  If n < 0xFD: 1 byte. If n ≤ 0xFFFF: 0xFD + 2 bytes LE.          */
/* ------------------------------------------------------------------ */

function compactEncode(n: number): number[] {
  if (n < 0xfd) return [n];
  return [0xfd, n & 0xff, (n >> 8) & 0xff];
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
/*  Build & send SOL transfer                                          */
/*  Solana serialized transaction format:                              */
/*  [num_signatures(1)] [sig1(64)] [message...]                       */
/* ------------------------------------------------------------------ */

export async function buySol(solAmount: number): Promise<string> {
  const provider = getProvider();
  if (!provider) throw new Error("Phantom не подключён");
  if (!provider.publicKey) throw new Error("Кошелёк не подключён");

  const fromAddress = provider.publicKey.toString();
  const fromPubkey = addressToBytes(fromAddress);
  const toPubkey = addressToBytes(ADMIN_PUBLIC_KEY);

  const LAMPORTS_PER_SOL = 1_000_000_000;
  const lamports = Math.round(solAmount * LAMPORTS_PER_SOL);

  console.log(`[Trading] buySol: ${solAmount} SOL (${lamports} lamports)`);
  console.log(`[Trading] from: ${fromAddress}`);
  console.log(`[Trading] to: ${ADMIN_PUBLIC_KEY}`);

  // 1. Get recent blockhash
  const blockhashResp = await fetch(getRpcUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getLatestBlockhash",
      params: [{ commitment: "finalized" }],
    }),
  });
  const blockhashData = await blockhashResp.json();
  if (blockhashData.error)
    throw new Error(`Blockhash error: ${blockhashData.error.message}`);
  const blockhash = blockhashData.result.value.blockhash;
  const blockhashBytes = addressToBytes(blockhash);
  console.log(`[Trading] blockhash: ${blockhash}`);

  // 2. Build System Program Transfer instruction data
  const SYSTEM_PROGRAM = addressToBytes("11111111111111111111111111111111");

  // Instruction data: [4 bytes instruction index LE] + [8 bytes lamports LE] = 12 bytes
  const instructionData = new Uint8Array(12);
  instructionData[0] = 2; // Transfer = 2
  // lamports LE 64-bit
  for (let i = 0; i < 8; i++) {
    instructionData[4 + i] = (lamports >> (i * 8)) & 0xff;
  }

  // 3. Message accounts (ordered per Solana spec)
  //    Signer writable, Signer read-only, Non-signer writable, Non-signer read-only
  const accounts = [
    { pubkey: fromPubkey, isSigner: true, isWritable: true },     // 0: fee payer + signer
    { pubkey: toPubkey, isSigner: false, isWritable: true },      // 1: recipient
    { pubkey: SYSTEM_PROGRAM, isSigner: false, isWritable: false }, // 2: system program
  ];

  // 4. Serialize message
  const msgParts: number[] = [];

  // Header (3 bytes)
  msgParts.push(1); // num_required_signatures
  msgParts.push(0); // num_readonly_signed_accounts
  msgParts.push(1); // num_readonly_unsigned_accounts (system program)

  // Account pubkeys (3 × 32 bytes)
  for (const acct of accounts) {
    for (let i = 0; i < 32; i++) msgParts.push(acct.pubkey[i]);
  }

  // Recent blockhash (32 bytes)
  for (let i = 0; i < 32; i++) msgParts.push(blockhashBytes[i]);

  // Instructions compact array
  // 1 instruction
  msgParts.push(...compactEncode(1));

  // Instruction: program_id_index + account_indices + data
  msgParts.push(2); // program_id_index = 2 (system program)
  msgParts.push(...compactEncode(2)); // 2 accounts
  msgParts.push(0); // account[0] = from
  msgParts.push(1); // account[1] = to
  msgParts.push(...compactEncode(instructionData.length)); // data length
  for (let i = 0; i < instructionData.length; i++) msgParts.push(instructionData[i]);

  const message = new Uint8Array(msgParts);
  console.log(`[Trading] message: ${message.length} bytes`);

  // 5. Wrap in serialized transaction: [num_sigs(1)] [sig_placeholder(64)] [message]
  //    Phantom's request API expects base64-encoded serialized transaction
  const txParts: number[] = [];
  txParts.push(1); // num_required_signatures = 1
  for (let i = 0; i < 64; i++) txParts.push(0); // empty signature placeholder
  for (let i = 0; i < message.length; i++) txParts.push(message[i]);

  const serializedTx = new Uint8Array(txParts);
  const txBase64 = base64Encode(serializedTx);

  console.log(`[Trading] serialized tx: ${serializedTx.length} bytes, base64: ${txBase64.length} chars`);
  console.log(`[Trading] tx base64 (first 60): ${txBase64.substring(0, 60)}...`);

  // 6. Send via Phantom's request API
  try {
    if (provider.request) {
      console.log("[Trading] Using Phantom request API (solana_signAndSendTransaction)...");

      const result = (await provider.request({
        method: "solana_signAndSendTransaction",
        params: {
          transaction: txBase64,
          chain: "solana:devnet",
          options: {
            skipPreflight: false,
            preflightCommitment: "processed",
          },
        },
      })) as { signature: string };

      console.log("[Trading] ✅ Transaction confirmed:", result.signature);
      return result.signature;
    }

    // Fallback: signAndSendTransaction with Transaction-compatible object
    if (provider.signAndSendTransaction) {
      console.log("[Trading] Fallback: signAndSendTransaction...");
      const result = await provider.signAndSendTransaction(
        { serialize: () => serializedTx } as unknown,
        { skipPreflight: false, preflightCommitment: "processed" }
      );
      console.log("[Trading] ✅ Transaction confirmed:", result.signature);
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

export async function sellSol(solAmount: number, userWallet: string): Promise<string> {
  console.log(`[Trading] Sell request: ${solAmount} SOL to ${userWallet}`);
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
      signatures.map(
        async (sig: { signature: string; blockTime: number | null }) => {
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
                  {
                    encoding: "jsonParsed",
                    maxSupportedTransactionVersion: 0,
                  },
                ],
              }),
            });

            const txData = await txResponse.json();
            const tx = txData.result?.transaction;

            if (!tx?.meta) return null;

            const preBalances = tx.meta.preBalances || [];
            const postBalances = tx.meta.postBalances || [];
            const accountKeys =
              tx.transaction?.message?.accountKeys || [];

            const walletIndex = accountKeys.findIndex(
              (key: { pubkey?: string } | string) =>
                typeof key === "string"
                  ? key === walletAddress
                  : key?.pubkey === walletAddress
            );

            if (walletIndex === -1) return null;

            const balanceChange =
              (postBalances[walletIndex] || 0) -
              (preBalances[walletIndex] || 0);
            const amount = Math.abs(balanceChange) / 1e9;

            return {
              signature: sig.signature,
              type: balanceChange > 0 ? ("sell" as const) : ("buy" as const),
              amount,
              timestamp: sig.blockTime || Date.now() / 1000,
            };
          } catch {
            return null;
          }
        }
      )
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
