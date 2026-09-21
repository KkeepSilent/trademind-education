import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(
  supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith("https://")
);

let _supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (_supabase) return _supabase;
  _supabase = createClient(supabaseUrl!, supabaseAnonKey!);
  return _supabase;
}

// Backwards compat
export const supabase = getSupabase();

/* ------------------------------------------------------------------ */
/*  Helper: safe query wrapper                                         */
/* ------------------------------------------------------------------ */

async function safeQuery<T, F = T>(
  fn: () => Promise<T>,
  fallback: F,
  label: string
): Promise<T | F> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[Supabase] ${label} failed:`, err);
    return fallback;
  }
}

/* ------------------------------------------------------------------ */
/*  Auth / User                                                        */
/* ------------------------------------------------------------------ */

export async function upsertWalletUser(
  walletAddress: string,
  solBalance: number
) {
  const db = getSupabase();
  if (!db) return { mode: "demo" as const };

  return safeQuery(
    async () => {
      // Log connection (fire and forget)
      void db.from("wallet_connections").insert({
        wallet_address: walletAddress,
        user_agent:
          typeof navigator !== "undefined" ? navigator.userAgent : null,
      });

      // Check if user exists
      const { data: existing } = await db
        .from("users")
        .select("*")
        .eq("wallet_address", walletAddress)
        .single();

      if (existing) {
        const { data, error } = await db
          .from("users")
          .update({
            sol_balance: solBalance,
            updated_at: new Date().toISOString(),
          })
          .eq("wallet_address", walletAddress)
          .select()
          .single();
        if (error) throw error;
        return { mode: "supabase" as const, user: data, isNew: false };
      }

      const { data, error } = await db
        .from("users")
        .insert({
          wallet_address: walletAddress,
          username: `trader_${walletAddress.slice(0, 6)}`,
          sol_balance: solBalance,
        })
        .select()
        .single();
      if (error) throw error;
      return { mode: "supabase" as const, user: data, isNew: true };
    },
    { mode: "demo" as const },
    "upsertWalletUser"
  );
}

export async function getUser(walletAddress: string) {
  const db = getSupabase();
  if (!db) return null;

  return safeQuery(
    async () => {
      const { data, error } = await db
        .from("users")
        .select("*")
        .eq("wallet_address", walletAddress)
        .single();
      if (error) throw error;
      return data;
    },
    null,
    "getUser"
  );
}

export async function updateSolBalance(
  walletAddress: string,
  solBalance: number
) {
  const db = getSupabase();
  if (!db) return;

  await safeQuery(
    async () => {
      const { error } = await db
        .from("users")
        .update({ sol_balance: solBalance })
        .eq("wallet_address", walletAddress);
      if (error) throw error;
    },
    undefined,
    "updateSolBalance"
  );
}

export async function incrementTradeStats(
  walletAddress: string,
  pnl: number
) {
  const db = getSupabase();
  if (!db) return;

  await safeQuery(
    async () => {
      const user = await getUser(walletAddress);
      if (!user) return;
      const { error } = await db
        .from("users")
        .update({
          total_trades: user.total_trades + 1,
          winning_trades: user.winning_trades + (pnl > 0 ? 1 : 0),
          total_pnl: user.total_pnl + pnl,
        })
        .eq("wallet_address", walletAddress);
      if (error) throw error;
    },
    undefined,
    "incrementTradeStats"
  );
}

/* ------------------------------------------------------------------ */
/*  Progress                                                           */
/* ------------------------------------------------------------------ */

export async function getUserProgress(walletAddress: string) {
  const db = getSupabase();
  if (!db) return [];

  return safeQuery(
    async () => {
      const user = await getUser(walletAddress);
      if (!user) return [];
      const { data, error } = await db
        .from("user_progress")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    [],
    "getUserProgress"
  );
}

export async function upsertUserProgress(
  walletAddress: string,
  lessonSlug: string,
  status: string,
  score: number
) {
  const db = getSupabase();
  if (!db) return { mode: "demo" as const };

  return safeQuery(
    async () => {
      const user = await getUser(walletAddress);
      if (!user) return { mode: "demo" as const };
      const { data, error } = await db
        .from("user_progress")
        .upsert(
          {
            user_id: user.id,
            lesson_slug: lessonSlug,
            status,
            score,
            completed_at:
              status === "completed" ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,lesson_slug" }
        )
        .select()
        .single();
      if (error) throw error;
      return { mode: "supabase" as const, progress: data };
    },
    { mode: "demo" as const },
    "upsertUserProgress"
  );
}

/* ------------------------------------------------------------------ */
/*  Sessions                                                           */
/* ------------------------------------------------------------------ */

export async function createSimulationSession(
  walletAddress: string,
  scenarioId: string,
  startingBalance: number
) {
  const db = getSupabase();
  if (!db) return { mode: "demo" as const };

  return safeQuery(
    async () => {
      const user = await getUser(walletAddress);
      if (!user) return { mode: "demo" as const };
      const { data, error } = await db
        .from("simulation_sessions")
        .insert({
          user_id: user.id,
          scenario_id: scenarioId,
          starting_balance: startingBalance,
          current_balance: startingBalance,
        })
        .select()
        .single();
      if (error) throw error;
      return { mode: "supabase" as const, session: data };
    },
    { mode: "demo" as const },
    "createSimulationSession"
  );
}

/* ------------------------------------------------------------------ */
/*  Trades                                                             */
/* ------------------------------------------------------------------ */

export async function saveTrade(
  walletAddress: string,
  sessionId: string,
  trade: {
    asset_symbol: string;
    side: string;
    order_type?: string;
    entry_price: number;
    quantity: number;
    dollar_amount: number;
    limit_price?: number;
    take_profit?: number;
    stop_loss?: number;
    risk_percent: number;
  }
) {
  const db = getSupabase();
  if (!db) return { mode: "demo" as const };

  return safeQuery(
    async () => {
      const user = await getUser(walletAddress);
      if (!user) return { mode: "demo" as const };

      const { data, error } = await db
        .from("trades")
        .insert({
          session_id: sessionId,
          user_id: user.id,
          asset_symbol: trade.asset_symbol,
          side: trade.side,
          order_type: trade.order_type ?? "market",
          entry_price: trade.entry_price,
          quantity: trade.quantity,
          dollar_amount: trade.dollar_amount,
          limit_price: trade.limit_price ?? null,
          take_profit: trade.take_profit ?? null,
          stop_loss: trade.stop_loss ?? null,
          risk_percent: trade.risk_percent,
          status: "open",
        })
        .select()
        .single();

      if (error) {
        console.error("[Supabase] saveTrade error:", error);
        throw error;
      }
      return { mode: "supabase" as const, dbTrade: data };
    },
    { mode: "demo" as const },
    "saveTrade"
  );
}

export async function closeTrade(
  tradeId: string,
  exitPrice: number,
  pnl: number
) {
  const db = getSupabase();
  if (!db) return;

  await safeQuery(
    async () => {
      const { error } = await db
        .from("trades")
        .update({
          exit_price: exitPrice,
          pnl,
          status: "closed",
          closed_at: new Date().toISOString(),
        })
        .eq("id", tradeId);
      if (error) throw error;
    },
    undefined,
    "closeTrade"
  );
}

/* ------------------------------------------------------------------ */
/*  Achievements                                                       */
/* ------------------------------------------------------------------ */

export async function getAllAchievements() {
  const db = getSupabase();
  if (!db) return [];

  return safeQuery(
    async () => {
      const { data, error } = await db
        .from("achievements")
        .select("*")
        .order("category");
      if (error) throw error;
      return data ?? [];
    },
    [],
    "getAllAchievements"
  );
}

export async function getUserAchievements(walletAddress: string) {
  const db = getSupabase();
  if (!db) return [];

  return safeQuery(
    async () => {
      const user = await getUser(walletAddress);
      if (!user) return [];
      const { data, error } = await db
        .from("user_achievements")
        .select("*, achievements(*)")
        .eq("user_id", user.id);
      if (error) throw error;
      return data ?? [];
    },
    [],
    "getUserAchievements"
  );
}

export async function unlockAchievement(
  walletAddress: string,
  achievementSlug: string
) {
  const db = getSupabase();
  if (!db) return false;

  return safeQuery(
    async () => {
      const user = await getUser(walletAddress);
      if (!user) return false;

      // Get achievement
      const { data: achievement } = await db
        .from("achievements")
        .select("id")
        .eq("slug", achievementSlug)
        .single();
      if (!achievement) return false;

      // Check if already unlocked
      const { data: existing } = await db
        .from("user_achievements")
        .select("id")
        .eq("user_id", user.id)
        .eq("achievement_id", achievement.id)
        .single();
      if (existing) return false;

      // Unlock
      const { error } = await db.from("user_achievements").insert({
        user_id: user.id,
        achievement_id: achievement.id,
      });
      if (error) throw error;
      return true;
    },
    false,
    "unlockAchievement"
  );
}

export async function checkAndUnlockAchievements(walletAddress: string) {
  const db = getSupabase();
  if (!db) return [];

  const user = await getUser(walletAddress);
  if (!user) return [];

  const unlocked: string[] = [];

  // First trade
  if (user.total_trades >= 1) {
    if (await unlockAchievement(walletAddress, "first-trade"))
      unlocked.push("first-trade");
  }
  if (user.total_trades >= 10) {
    if (await unlockAchievement(walletAddress, "ten-trades"))
      unlocked.push("ten-trades");
  }
  if (user.total_trades >= 100) {
    if (await unlockAchievement(walletAddress, "hundred-trades"))
      unlocked.push("hundred-trades");
  }
  if (user.winning_trades >= 1) {
    if (await unlockAchievement(walletAddress, "first-profit"))
      unlocked.push("first-profit");
  }
  if (user.sol_balance > 10) {
    if (await unlockAchievement(walletAddress, "sol-whale"))
      unlocked.push("sol-whale");
  }

  return unlocked;
}

/* ------------------------------------------------------------------ */
/*  AI Feedback                                                        */
/* ------------------------------------------------------------------ */

export async function saveAIFeedback(
  walletAddress: string,
  tradeId: string | null,
  feedbackText: string,
  riskScore: number
) {
  const db = getSupabase();
  if (!db) return { mode: "demo" as const };

  return safeQuery(
    async () => {
      const user = await getUser(walletAddress);
      if (!user) return { mode: "demo" as const };
      const { data, error } = await db
        .from("ai_feedback")
        .insert({
          user_id: user.id,
          trade_id: tradeId,
          feedback_text: feedbackText,
          risk_score: riskScore,
        })
        .select()
        .single();
      if (error) throw error;
      return { mode: "supabase" as const, feedback: data };
    },
    { mode: "demo" as const },
    "saveAIFeedback"
  );
}

/* ------------------------------------------------------------------ */
/*  Stats                                                              */
/* ------------------------------------------------------------------ */

export async function getUserStats(walletAddress: string) {
  const user = await getUser(walletAddress);
  if (!user) return null;

  const [progress, achievements] = await Promise.all([
    getUserProgress(walletAddress),
    getUserAchievements(walletAddress),
  ]);

  const completedLessons = progress.filter(
    (p) => p.status === "completed"
  ).length;

  return {
    user,
    completedLessons,
    totalLessons: 4,
    achievementsUnlocked: achievements.length,
    totalAchievements: 12,
    winRate:
      user.total_trades > 0
        ? Math.round((user.winning_trades / user.total_trades) * 100)
        : 0,
  };
}
