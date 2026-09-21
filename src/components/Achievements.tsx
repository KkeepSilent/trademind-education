"use client";

import { useEffect, useState } from "react";
import { Trophy, Lock, Star, RefreshCw, AlertTriangle } from "lucide-react";
import {
  getAllAchievements,
  getUserAchievements,
  isSupabaseConfigured,
} from "@/lib/supabase";

type Achievement = {
  id: string;
  slug: string;
  title: string;
  description: string;
  icon: string;
  category: string;
  requirement_text: string;
};

type UserAchievement = {
  achievement_id: string;
  unlocked_at: string;
  achievements: Achievement;
};

const CATEGORY_LABELS: Record<string, string> = {
  general: "Общие",
  trading: "Трейдинг",
  risk: "Управление рисками",
  learning: "Обучение",
};

type AchievementsProps = {
  walletAddress: string | null;
};

// Fallback achievements if DB is not available
const FALLBACK_ACHIEVEMENTS: Achievement[] = [
  { id: "1", slug: "first-trade", title: "Первая сделка", description: "Открыл первую позицию в симуляторе", icon: "🎯", category: "trading", requirement_text: "Открыть 1 сделку" },
  { id: "2", slug: "ten-trades", title: "Десяток", description: "Совершил 10 сделок", icon: "🔟", category: "trading", requirement_text: "Открыть 10 сделок" },
  { id: "3", slug: "hundred-trades", title: "Торговец", description: "Совершил 100 сделок", icon: "💼", category: "trading", requirement_text: "Открыть 100 сделок" },
  { id: "4", slug: "first-profit", title: "Первая прибыль", description: "Закрыл сделку с положительным P&L", icon: "💰", category: "trading", requirement_text: "Закрыть сделку в плюс" },
  { id: "5", slug: "big-profit", title: "Крупный выигрыш", description: "Одна сделка принесла > $500", icon: "🤑", category: "trading", requirement_text: "P&L > $500" },
  { id: "6", slug: "no-stop-loss", title: "Самоубийца", description: "Открыл 5 сделок подряд без стоп-лосса", icon: "💀", category: "risk", requirement_text: "5 сделок без SL" },
  { id: "7", slug: "perfect-risk", title: "Мастер риска", description: "10 сделок подряд с риском < 2%", icon: "🛡️", category: "risk", requirement_text: "10 сделок с риском < 2%" },
  { id: "8", slug: "overtrader", title: "Наркоман трейдинга", description: "Открыл 5 сделок за минуту", icon: "⚡", category: "risk", requirement_text: "5 сделок за минуту" },
  { id: "9", slug: "lesson-one", title: "Первый урок", description: "Прошёл первый учебный модуль", icon: "📚", category: "learning", requirement_text: "Завершить 1 урок" },
  { id: "10", slug: "all-lessons", title: "Выпускник", description: "Прошёл все учебные модули", icon: "🎓", category: "learning", requirement_text: "Завершить все уроки" },
  { id: "11", slug: "wallet-connected", title: "Кошелёк подключён", description: "Подключил Phantom кошелёк", icon: "🔗", category: "general", requirement_text: "Подключить кошелёк" },
  { id: "12", slug: "sol-whale", title: "Кит", description: "Баланс на кошельке > 10 SOL", icon: "🐋", category: "general", requirement_text: "Баланс > 10 SOL" },
];

export function Achievements({ walletAddress }: AchievementsProps) {
  const [allAchievements, setAllAchievements] = useState<Achievement[]>([]);
  const [unlockedSlugs, setUnlockedSlugs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setDbError(false);

      if (!walletAddress) {
        setAllAchievements(FALLBACK_ACHIEVEMENTS);
        setUnlockedSlugs(new Set());
        setLoading(false);
        return;
      }

      try {
        if (isSupabaseConfigured) {
          const [all, userAch] = await Promise.all([
            getAllAchievements(),
            getUserAchievements(walletAddress),
          ]);

          if (all.length > 0) {
            setAllAchievements(all);
            setUnlockedSlugs(new Set(userAch.map((ua) => ua.achievements?.slug).filter(Boolean)));
          } else {
            // DB connected but table is empty — SQL not applied
            setAllAchievements(FALLBACK_ACHIEVEMENTS);
            setDbError(true);
          }
        } else {
          setAllAchievements(FALLBACK_ACHIEVEMENTS);
        }
      } catch (err) {
        console.error("Failed to load achievements:", err);
        setAllAchievements(FALLBACK_ACHIEVEMENTS);
        setDbError(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [walletAddress]);

  // Group by category
  const grouped = allAchievements.reduce(
    (acc, ach) => {
      (acc[ach.category] ??= []).push(ach);
      return acc;
    },
    {} as Record<string, Achievement[]>
  );

  const totalUnlocked = unlockedSlugs.size;
  const totalAchievements = allAchievements.length;

  return (
    <section className="panel rounded-lg p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Достижения</h2>
          <p className="text-sm text-ink/65">
            {walletAddress
              ? `${totalUnlocked} из ${totalAchievements} получено`
              : "Подключи кошелёк, чтобы видеть свои награды"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Star size={18} className="text-steel" />
          <Trophy className="text-steel" size={22} />
        </div>
      </div>

      {/* DB warning */}
      {dbError && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Таблицаachievements пуста</p>
            <p>Выполни SQL-схему в Supabase SQL Editor, чтобы загрузить достижения.</p>
          </div>
        </div>
      )}

      {/* Progress bar */}
      <div className="mb-5">
        <div className="h-3 overflow-hidden rounded-full bg-ink/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-mint to-steel transition-all duration-500"
            style={{
              width: `${
                totalAchievements > 0
                  ? (totalUnlocked / totalAchievements) * 100
                  : 0
              }%`,
            }}
          />
        </div>
        <p className="mt-1 text-right text-xs text-ink/45">
          {totalAchievements > 0
            ? Math.round((totalUnlocked / totalAchievements) * 100)
            : 0}
          %
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 px-4 py-5 text-sm text-ink/50">
          <RefreshCw size={14} className="animate-spin" />
          Загрузка...
        </div>
      ) : (
        Object.entries(grouped).map(([category, achievements]) => (
          <div key={category} className="mb-5 last:mb-0">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/50">
              {CATEGORY_LABELS[category] ?? category}
            </h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {achievements.map((ach) => {
                const unlocked = unlockedSlugs.has(ach.slug);
                return (
                  <div
                    key={ach.slug}
                    className={`flex items-start gap-3 rounded-md border p-3 transition ${
                      unlocked
                        ? "border-mint/30 bg-mint/5"
                        : "border-ink/10 bg-white opacity-60"
                    }`}
                  >
                    <span className="text-2xl">{ach.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">
                        {ach.title}
                        {unlocked && (
                          <span className="ml-2 text-[10px] font-normal text-mint">
                            ✓ получено
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-ink/60">{ach.description}</p>
                      <p className="mt-1 text-[10px] text-ink/40">
                        {ach.requirement_text}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {!walletAddress && (
        <div className="mt-4 flex items-center gap-2 rounded-md border border-dashed border-ink/15 px-4 py-4 text-sm text-ink/50">
          <Lock size={18} />
          Подключи Phantom кошелёк для отслеживания прогресса.
        </div>
      )}
    </section>
  );
}
