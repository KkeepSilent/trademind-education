import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(request: NextRequest) {
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 503 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await request.json();
    const { action, walletAddress, data } = body;

    switch (action) {
      case "getProfile": {
        const { data: user, error } = await supabase
          .from("users")
          .select("*")
          .eq("wallet_address", walletAddress)
          .single();

        if (error) throw error;
        return NextResponse.json({ user });
      }

      case "getProgress": {
        const { data: user } = await supabase
          .from("users")
          .select("id")
          .eq("wallet_address", walletAddress)
          .single();

        if (!user) return NextResponse.json({ progress: [] });

        const { data: progress, error } = await supabase
          .from("user_progress")
          .select("*")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false });

        if (error) throw error;
        return NextResponse.json({ progress });
      }

      case "getStats": {
        const { data: user } = await supabase
          .from("users")
          .select("id")
          .eq("wallet_address", walletAddress)
          .single();

        if (!user) return NextResponse.json({ stats: null });

        const { count: sessionCount } = await supabase
          .from("simulation_sessions")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id);

        const { count: tradeCount } = await supabase
          .from("trades")
          .select("*", { count: "exact", head: true })
          .eq("session_id", user.id);

        const { count: feedbackCount } = await supabase
          .from("ai_feedback")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id);

        return NextResponse.json({
          stats: {
            sessions: sessionCount ?? 0,
            trades: tradeCount ?? 0,
            feedback: feedbackCount ?? 0
          }
        });
      }

      default:
        return NextResponse.json(
          { error: "Unknown action" },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
