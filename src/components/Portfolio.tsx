"use client";

import { useMemo } from "react";
import {
  Briefcase,
  TrendingUp,
  TrendingDown,
  Clock,
  DollarSign,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { ClosedPosition } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

type PortfolioProps = {
  closedPositions: ClosedPosition[];
  currentPnl: number;
  totalCapital: number; // SOL balance * SOL_USD_RATE
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatUsd(n: number) {
  return `$${Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}с`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}м ${seconds % 60}с`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}ч ${m}м`;
}

/* ------------------------------------------------------------------ */
/*  Equity curve                                                       */
/* ------------------------------------------------------------------ */

function buildEquityCurve(positions: ClosedPosition[], startingCapital: number) {
  const equity: { time: string; equity: number; pnl: number }[] = [];
  let runningEquity = startingCapital;

  // Starting point
  equity.push({ time: "Начало", equity: runningEquity, pnl: 0 });

  for (const pos of positions) {
    runningEquity += pos.pnl;
    equity.push({
      time: pos.closedAt
        ? new Date(pos.closedAt).toLocaleTimeString("ru-RU", {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "",
      equity: runningEquity,
      pnl: pos.pnl,
    });
  }

  return equity;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function Portfolio({
  closedPositions,
  currentPnl,
  totalCapital,
}: PortfolioProps) {
  const stats = useMemo(() => {
    const totalTrades = closedPositions.length;
    const winningTrades = closedPositions.filter((p) => p.pnl > 0).length;
    const losingTrades = closedPositions.filter((p) => p.pnl < 0).length;
    const totalPnl = closedPositions.reduce((sum, p) => sum + p.pnl, 0);
    const winRate =
      totalTrades > 0 ? Math.round((winningTrades / totalTrades) * 100) : 0;
    const avgHoldTime =
      totalTrades > 0
        ? Math.round(
            closedPositions.reduce((sum, p) => sum + p.duration, 0) / totalTrades
          )
        : 0;
    const unrealizedPnl = currentPnl;

    return {
      totalTrades,
      winningTrades,
      losingTrades,
      totalPnl,
      winRate,
      avgHoldTime,
      unrealizedPnl,
      netPnl: totalPnl + unrealizedPnl,
    };
  }, [closedPositions, currentPnl]);

  const equityCurve = useMemo(
    () => buildEquityCurve(closedPositions, totalCapital),
    [closedPositions, totalCapital]
  );

  const recentPositions = closedPositions.slice(-10).reverse();

  if (closedPositions.length === 0 && currentPnl === 0) {
    return (
      <section className="panel rounded-lg p-5">
        <div className="flex items-center gap-2 mb-3">
          <Briefcase size={18} className="text-steel" />
          <h2 className="text-base font-bold">Портфель</h2>
        </div>
        <p className="text-sm text-ink/40 text-center py-6">
          Откройте первую сделку, чтобы увидеть портфель
        </p>
      </section>
    );
  }

  return (
    <section className="panel rounded-lg p-5">
      <div className="flex items-center gap-2 mb-4">
        <Briefcase size={18} className="text-steel" />
        <h2 className="text-base font-bold">Портфель</h2>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <SummaryCard
          label="Нереализованный P&L"
          value={formatUsd(stats.unrealizedPnl)}
          positive={stats.unrealizedPnl >= 0}
          icon={<DollarSign size={14} />}
        />
        <SummaryCard
          label="Реализованный P&L"
          value={formatUsd(stats.totalPnl)}
          positive={stats.totalPnl >= 0}
          icon={<TrendingUp size={14} />}
        />
        <SummaryCard
          label="Винрейт"
          value={`${stats.winRate}%`}
          positive={stats.winRate >= 50}
          icon={<TrendingUp size={14} />}
        />
        <SummaryCard
          label="Среднее время"
          value={formatDuration(stats.avgHoldTime)}
          positive
          icon={<Clock size={14} />}
        />
      </div>

      {/* Equity curve */}
      {equityCurve.length > 1 && (
        <div className="mb-4">
          <h3 className="text-xs font-semibold text-ink/50 mb-2">
            Кривая капитала
          </h3>
          <div className="h-[140px] rounded-lg bg-ink/[0.02] p-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={equityCurve}>
                <defs>
                  <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#88d4ab" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#88d4ab" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                <YAxis
                  tick={{ fontSize: 10 }}
                  domain={["auto", "auto"]}
                  tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                />
                <Tooltip
                  formatter={(value: number) => [
                    `$${value.toFixed(2)}`,
                    "Капитал",
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="equity"
                  stroke="#88d4ab"
                  fill="url(#equityGrad)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Recent trades */}
      {recentPositions.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-ink/50 mb-2">
            Последние сделки
          </h3>
          <div className="space-y-1.5">
            {recentPositions.map((pos) => (
              <div
                key={pos.id}
                className="flex items-center justify-between rounded-lg bg-ink/[0.02] px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                      pos.side === "buy"
                        ? "bg-mint/20 text-mint"
                        : "bg-coral/20 text-coral"
                    }`}
                  >
                    {pos.side === "buy" ? "▲" : "▼"} {pos.side}
                  </span>
                  <span className="text-xs font-medium">{pos.asset}</span>
                </div>
                <div className="text-right">
                  <p
                    className={`text-xs font-bold ${
                      pos.pnl >= 0 ? "text-mint" : "text-coral"
                    }`}
                  >
                    {pos.pnl >= 0 ? "+" : ""}
                    {formatUsd(pos.pnl)}
                  </p>
                  <p className="text-[10px] text-ink/40">
                    {formatDuration(pos.duration)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Summary card                                                       */
/* ------------------------------------------------------------------ */

function SummaryCard({
  label,
  value,
  positive,
  icon,
}: {
  label: string;
  value: string;
  positive: boolean;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-lg bg-ink/[0.02] p-3">
      <div className="flex items-center gap-1 mb-1">
        <span className={`${positive ? "text-mint" : "text-coral"}`}>{icon}</span>
        <span className="text-[10px] font-medium text-ink/50">{label}</span>
      </div>
      <p
        className={`text-sm font-bold ${
          positive ? "text-mint" : "text-coral"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
