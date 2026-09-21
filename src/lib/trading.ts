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
/*  Solana address <-> bytes                                           */
/* ------------------------------------------------------------------ */

const PUBKEY_LENGTH = 32;

function addressToBytes(address: string): Uint8Array {
  return base58Decode(address);
}

function bytesToAddress(bytes: Uint8Array): string {
  return base58Encode(bytes);
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
/*  SOL Transfer — Pure Solana transaction serialization                */
/*  Format: https://docs.solana.com/developing/programming-model/transactions */
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
  if (blockhashData.error) throw new Error(`Blockhash error: ${blockhashData.error.message}`);
  const blockhash = blockhashData.result.value.blockhash;
  const blockhashBytes = addressToBytes(blockhash);

  console.log(`[Trading] blockhash: ${blockhash}`);

  // 2. Build System Program Transfer instruction
  //    Program: 11111111111111111111111111111111 (System Program)
  //    Instruction 2 = Transfer
  //    Data: [2, 0, 0, 0, ...lamports_le(8 bytes)]
  const SYSTEM_PROGRAM = addressToBytes("11111111111111111111111111111111");
  const SYSTEM_PROGRAM_INDEX = 0; // will be assigned after sorting accounts

  // Transfer instruction data: 4 bytes (instruction index) + 8 bytes (lamports LE)
  const instructionData = new Uint8Array(12);
  instructionData[0] = 2; // Transfer instruction
  // lamports as little-endian 64-bit integer
  instructionData[4] = lamports & 0xff;
  instructionData[5] = (lamports >> 8) & 0xff;
  instructionData[6] = (lamports >> 16) & 0xff;
  instructionData[7] = (lamports >> 24) & 0xff;
  instructionData[8] = (lamports >> 32) & 0xff;
  instructionData[9] = (lamports >> 40) & 0xff;
  instructionData[10] = (lamports >> 48) & 0xff;
  instructionData[11] = (lamports >> 56) & 0xff;

  // 3. Sort accounts (Solana requirement: signer writable first, signer read-only second, etc.)
  //    Accounts: [from (signer+writable), system_program (readonly)]
  //    Also need to include admin wallet as a non-signer? No — just the System Program transfer.
  //    Actually for a simple transfer, accounts = [fromPubkey, toPubkey, systemProgram]
  //    But we need to be careful about the account ordering.

  // For SystemProgram.transfer, the accounts are:
  // 0: from (signer, writable)
  // 1: to (writable)
  // program: system program (readonly)

  // Solana account order:
  // 1. Signers that are writable (from)
  // 2. Signers that are read-only (none)
  // 3. Non-signers that are writable (to)
  // 4. Non-signers that are read-only (system program)

  const accounts = [
    { pubkey: fromPubkey, isSigner: true, isWritable: true },    // index 0
    { pubkey: toPubkey, isSigner: false, isWritable: true },     // index 1
    { pubkey: SYSTEM_PROGRAM, isSigner: false, isWritable: false }, // index 2
  ];

  // 4. Serialize message
  // Header
  const header = new Uint8Array([
    1,  // num_required_signatures (1 = only fromPubkey)
    0,  // num_readonly_signed_accounts
    1,  // num_readonly_unsigned_accounts (system program)
  ]);

  // Compact array of account pubkeys
  const accountsBuffer = new Uint8Array(32 * accounts.length);
  for (let i = 0; i < accounts.length; i++) {
    accountsBuffer.set(accounts[i].pubkey, i * 32);
  }

  // Recent blockhash (32 bytes)
  // Already have blockhashBytes

  // Instructions compact array
  // One instruction:
  // - program_id_index: 1 byte (index 2 = system program)
  // - account_indices: [0, 1] (from, to)
  // - instruction_data: 12 bytes
  const programIdIndex = 2; // system program is at index 2
  const accountIndices = new Uint8Array([0, 1]); // from, to

  // Instruction serialized: [program_id_index, account_indices_len, ...account_indices, data_len, ...data]
  const instructionSerialized = new Uint8Array(1 + 1 + accountIndices.length + 1 + instructionData.length);
  instructionSerialized[0] = programIdIndex;
  instructionSerialized[1] = accountIndices.length;
  instructionSerialized.set(accountIndices, 2);
  instructionSerialized[2 + accountIndices.length] = instructionData.length;
  instructionSerialized.set(instructionData, 3 + accountIndices.length);

  // Compact array of instructions
  const instructionsCompactArray = new Uint8Array(1 + instructionSerialized.length);
  instructionsCompactArray[0] = 1; // 1 instruction
  instructionsCompactArray.set(instructionSerialized, 1);

  // 5. Assemble message
  const message = new Uint8Array(
    header.length + accountsBuffer.length + 32 + instructionsCompactArray.length
  );
  let offset = 0;
  message.set(header, offset); offset += header.length;
  message.set(accountsBuffer, offset); offset += accountsBuffer.length;
  message.set(blockhashBytes, offset); offset += 32;
  message.set(instructionsCompactArray, offset);

  console.log(`[Trading] message length: ${message.length} bytes`);

  // 6. Send to Phantom for signing + sending
  //    Phantom accepts { transaction: number[], chain: "solana:mainnet-beta" | "solana:devnet" }
  try {
    if (provider.signAndSendTransaction) {
      console.log("[Trading] Using signAndSendTransaction with message bytes...");

      // Try sending as serialized message
      const result = await provider.signAndSendTransaction(
        { transaction: Array.from(message), chain: "solana:devnet" },
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
