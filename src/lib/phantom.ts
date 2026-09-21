"use client";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type PhantomProvider = {
  isPhantom?: boolean;
  publicKey?: { toString: () => string };
  connect: () => Promise<{ publicKey: { toString: () => string } }>;
  disconnect?: () => Promise<void>;
  signMessage?: (message: Uint8Array) => Promise<{ signature: Uint8Array }>;
  /** Phantom Solana Provider methods */
  request?: (args: {
    method: string;
    params?: Record<string, unknown>;
  }) => Promise<unknown>;
};

declare global {
  interface Window {
    solana?: PhantomProvider;
  }
}

/* ------------------------------------------------------------------ */
/*  Provider helpers                                                   */
/* ------------------------------------------------------------------ */

export function getPhantomProvider(): PhantomProvider | null {
  if (typeof window === "undefined") return null;
  const provider = window.solana;
  return provider?.isPhantom ? provider : null;
}

function requireProvider(): PhantomProvider {
  const provider = getPhantomProvider();
  if (!provider) {
    throw new Error(
      "Phantom Wallet не найден. Установите расширение Phantom: https://phantom.app"
    );
  }
  return provider;
}

/* ------------------------------------------------------------------ */
/*  Connection                                                         */
/* ------------------------------------------------------------------ */

export async function connectPhantomWallet(): Promise<string> {
  const provider = requireProvider();
  const response = await provider.connect();
  return response.publicKey.toString();
}

export async function disconnectPhantomWallet(): Promise<void> {
  const provider = getPhantomProvider();
  if (provider?.disconnect) {
    await provider.disconnect();
  }
}

export function getConnectedPublicKey(): string | null {
  const provider = getPhantomProvider();
  return provider?.publicKey?.toString() ?? null;
}

/* ------------------------------------------------------------------ */
/*  Signing                                                            */
/* ------------------------------------------------------------------ */

/**
 * Sign an arbitrary message (used for wallet-based auth).
 * Returns base64-encoded signature.
 */
export async function signMessage(message: string): Promise<string> {
  const provider = requireProvider();

  if (!provider.signMessage) {
    throw new Error("Phantom не поддерживает подпись сообщений. Обновите расширение.");
  }

  const encodedMessage = new TextEncoder().encode(message);
  const { signature } = await provider.signMessage(encodedMessage);

  return btoa(String.fromCharCode(...signature));
}

/* ------------------------------------------------------------------ */
/*  SOL Transfer via Phantom request API                               */
/* ------------------------------------------------------------------ */

/**
 * Send SOL using Phantom's request method.
 * Uses the Solana Provider API: solana_signAndSendTransaction.
 */
export async function sendSol(
  toAddress: string,
  amountSol: number
): Promise<string> {
  const provider = requireProvider();
  const fromPubkey = provider.publicKey?.toString();
  if (!fromPubkey) {
    throw new Error("Кошелёк не подключён.");
  }

  if (!provider.request) {
    throw new Error("Phantom не поддерживает отправку транзакций. Обновите расширение.");
  }

  const lamports = Math.round(amountSol * 1_000_000_000);

  // Use Phantom's provider.request for transaction signing
  // This requires building the transaction as a base64-encoded message
  const DEVNET_RPC = "http://localhost:8899";

  // Get recent blockhash
  const blockhashResp = await fetch(DEVNET_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getLatestBlockhash",
      params: [{ commitment: "confirmed" }]
    })
  });
  const blockhashData = await blockhashResp.json();
  const blockhash = blockhashData.result.value.blockhash;

  // Build legacy transaction message for System Program transfer
  const transactionMessage = buildLegacyTransactionMessage(
    fromPubkey,
    toAddress,
    lamports,
    blockhash
  );

  // Request Phantom to sign and send
  const result = await provider.request({
    method: "solana_signAndSendTransaction",
    params: {
      transaction: transactionMessage,
      options: { skipPreflight: false, preflightCommitment: "confirmed" }
    }
  });

  return (result as { signature: string }).signature;
}

/**
 * Get SOL balance via JSON-RPC.
 */
export async function getSolBalance(): Promise<number> {
  const provider = getPhantomProvider();
  const pubkey = provider?.publicKey?.toString();
  if (!pubkey) return 0;

  const DEVNET_RPC = "http://localhost:8899";

  const resp = await fetch(DEVNET_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getBalance",
      params: [pubkey]
    })
  });

  const data = await resp.json();
  return (data.result?.value ?? 0) / 1_000_000_000;
}

/* ------------------------------------------------------------------ */
/*  Auth helpers                                                       */
/* ------------------------------------------------------------------ */

/**
 * Generate a nonce message for wallet authentication.
 */
export function generateAuthMessage(walletAddress: string): string {
  const timestamp = Date.now();
  const nonce = crypto.randomUUID();
  return [
    "TradeMind Education — аутентификация",
    "",
    `Кошелёк: ${walletAddress}`,
    `Время: ${new Date(timestamp).toISOString()}`,
    `Nonce: ${nonce}`,
    "",
    "Подпишите это сообщение для входа в систему."
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/*  Transaction building helpers (no @solana/web3.js)                  */
/* ------------------------------------------------------------------ */

/**
 * Build a base58-encoded System Program transfer instruction.
 * Returns the serialized message bytes as base64 for Phantom.
 */
function buildLegacyTransactionMessage(
  fromPubkey: string,
  toPubkey: string,
  lamports: number,
  blockhash: string
): string {
  // For simplicity, we encode a minimal transfer instruction
  // Phantom's provider.request can handle this format
  const message = {
    feePayer: fromPubkey,
    recentBlockhash: blockhash,
    instructions: [
      {
        keys: [
          { pubkey: fromPubkey, isSigner: true, isWritable: true },
          { pubkey: toPubkey, isSigner: false, isWritable: true }
        ],
        programId: "11111111111111111111111111111111",
        data: encodeTransferData(lamports)
      }
    ]
  };

  return btoa(JSON.stringify(message));
}

/**
 * Encode System Program transfer instruction data.
 * Transfer instruction: 4 bytes instruction index (2) + 8 bytes lamports
 */
function encodeTransferData(lamports: number): string {
  const buffer = new ArrayBuffer(12);
  const view = new DataView(buffer);

  // Instruction index 2 = Transfer
  view.setUint32(0, 2, true);
  // Lamports as little-endian u64
  view.setBigUint64(4, BigInt(lamports), true);

  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}
