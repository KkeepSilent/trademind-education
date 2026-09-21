"use client";

import { useEffect, useState } from "react";
import { BarChart3, Target, TrendingUp, Award } from "lucide-react";
import { getUserStats, isSupabaseConfigured } from "@/lib/supabase";

type Stats = {
  user: {
    total_trades: number;
    winning_trades: number;
    total_pnl: number;
    sol_balance: number;
    level: string;
  };
  completedLessons: number;
  totalLessons: number;
  achievementsUnlocked: number;
  totalAchievements: number;
  winRate: number;
};

type UserStatsProps = {
  walletAddress: string | null;
};

export function UserStats({ walletAddress }: UserStatsProps) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    if (!walletAddress || !isSupabaseConfigured) {
      setStats(null);
      return;
    }
    getUserStats(walletAddress).then(setStats).catch(() => setStats(null));
  }, [walletAddress]);

  if (!stats) return null;

  return (
    <section className="panel rounded-lg p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold">Статистика</h3>
        <BarChart3 size={16} className="text-steel" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <StatCard
          icon={<TrendingUp size={14} />}
          label="Баланс"
          value={`${stats.user.sol_balance.toFixed(2)} SOL`}
        />
        <StatCard
          icon={<Target size={14} />}
          label="Винрейт"
          value={`${stats.winRate}%`}
          accent={stats.winRate >= 50 ? "mint" : stats.winRate > 0 ? "coral" : undefined}
        />
        <StatCard
          icon={<BarChart3 size={14} />}
          label="Сделок"
          value={`${stats.user.total_trades}`}
        />
        <StatCard
          icon={<Award size={14} />}
          label="Награды"
          value={`${stats.achievementsUnlocked}/${stats.totalAchievements}`}
        />
      </div>

      {/* Lesson progress */}
      <div className="mt-3 rounded-md bg-paper px-3 py-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-ink/55">Уроки</span>
          <span className="font-semibold">
            {stats.completedLessons}/{stats.totalLessons}
          </span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink/10">
          <div
            className="h-full rounded-full bg-steel transition-all"
            style={{
              width: `${
                stats.totalLessons > 0
                  ? (stats.completedLessons / stats.totalLessons) * 100
                  : 0
              }%`,
            }}
          />
        </div>
      </div>

      {/* P&L */}
      {stats.user.total_trades > 0 && (
        <div className="mt-2 rounded-md bg-paper px-3 py-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-ink/55">Общий P&L</span>
            <span
              className={`font-semibold ${
                stats.user.total_pnl >= 0 ? "text-mint" : "text-coral"
              }`}
            >
              {stats.user.total_pnl >= 0 ? "+" : ""}$
              {stats.user.total_pnl.toFixed(2)}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: "mint" | "coral";
}) {
  return (
    <div className="rounded-md bg-paper px-3 py-2">
      <div className="mb-1 flex items-center gap-1 text-ink/45">
        {icon}
        <span className="text-[10px]">{label}</span>
      </div>
      <p
        className={`text-sm font-bold ${
          accent === "mint"
            ? "text-mint"
            : accent === "coral"
            ? "text-coral"
            : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
