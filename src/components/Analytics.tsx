"use client";

import { useMemo } from "react";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Activity,
  AlertTriangle,
  Zap,
} from "lucide-react";
import type { ClosedPosition, TradeAnalytics } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

type AnalyticsProps = {
  closedPositions: ClosedPosition[];
};

/* ------------------------------------------------------------------ */
/*  Analytics calculator                                               */
/* ------------------------------------------------------------------ */

function calculateAnalytics(positions: ClosedPosition[]): TradeAnalytics {
  const totalTrades = positions.length;
  if (totalTrades === 0) {
    return {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      totalPnl: 0,
      averagePnl: 0,
      bestTrade: 0,
      worstTrade: 0,
      profitFactor: 0,
      maxDrawdown: 0,
      averageHoldTime: 0,
      sharpeRatio: 0,
    };
  }

  const pnls = positions.map((p) => p.pnl);
  const winningTrades = pnls.filter((p) => p > 0).length;
  const losingTrades = pnls.filter((p) => p < 0).length;
  const totalPnl = pnls.reduce((sum, p) => sum + p, 0);
  const winRate = Math.round((winningTrades / totalTrades) * 100);
  const averagePnl = totalPnl / totalTrades;
  const bestTrade = Math.max(...pnls);
  const worstTrade = Math.min(...pnls);

  // Profit factor = gross profit / gross loss
  const grossProfit = pnls.filter((p) => p > 0).reduce((sum, p) => sum + p, 0);
  const grossLoss = Math.abs(
    pnls.filter((p) => p < 0).reduce((sum, p) => sum + p, 0)
  );
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  // Max drawdown
  let peak = 0;
  let maxDrawdown = 0;
  let equity = 0;
  for (const pnl of pnls) {
    equity += pnl;
    if (equity > peak) peak = equity;
    const drawdown = peak - equity;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  // Average hold time
  const averageHoldTime =
    positions.reduce((sum, p) => sum + p.duration, 0) / totalTrades;

  // Sharpe ratio (simplified: mean return / std dev of returns)
  const meanReturn = averagePnl;
  const variance =
    pnls.reduce((sum, p) => sum + Math.pow(p - meanReturn, 2), 0) / totalTrades;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0 ? meanReturn / stdDev : 0;

  return {
    totalTrades,
    winningTrades,
    losingTrades,
    winRate,
    totalPnl,
    averagePnl,
    bestTrade,
    worstTrade,
    profitFactor,
    maxDrawdown,
    averageHoldTime,
    sharpeRatio,
  };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function Analytics({ closedPositions }: AnalyticsProps) {
  const analytics = useMemo(
    () => calculateAnalytics(closedPositions),
    [closedPositions]
  );

  if (closedPositions.length === 0) {
    return (
      <section className="panel rounded-lg p-5">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 size={18} className="text-steel" />
          <h2 className="text-base font-bold">Аналитика</h2>
        </div>
        <p className="text-sm text-ink/40 text-center py-6">
          Закройте первую сделку для аналитики
        </p>
      </section>
    );
  }

  const profitFactorDisplay =
    analytics.profitFactor === Infinity
      ? "∞"
      : analytics.profitFactor.toFixed(2);

  const sharpeDisplay =
    analytics.sharpeRatio === Infinity
      ? "∞"
      : analytics.sharpeRatio.toFixed(2);

  return (
    <section className="panel rounded-lg p-5">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 size={18} className="text-steel" />
        <h2 className="text-base font-bold">Аналитика</h2>
      </div>

      {/* Main metrics grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <MetricCard
          icon={<TrendingUp size={14} />}
          label="Винрейт"
          value={`${analytics.winRate}%`}
          color={analytics.winRate >= 50 ? "mint" : "coral"}
          subtitle={`${analytics.winningTrades}W / ${analytics.losingTrades}L`}
        />
        <MetricCard
          icon={<Activity size={14} />}
          label="Profit Factor"
          value={profitFactorDisplay}
          color={analytics.profitFactor >= 1 ? "mint" : "coral"}
          subtitle="Прибыль / Убыток"
        />
        <MetricCard
          icon={<Zap size={14} />}
          label="Sharpe Ratio"
          value={sharpeDisplay}
          color={analytics.sharpeRatio >= 1 ? "mint" : analytics.sharpeRatio >= 0 ? "steel" : "coral"}
          subtitle="Риск-скорректированная"
        />
        <MetricCard
          icon={<TrendingUp size={14} />}
          label="Лучшая сделка"
          value={`+$${analytics.bestTrade.toFixed(2)}`}
          color="mint"
          subtitle="Максимальная прибыль"
        />
        <MetricCard
          icon={<TrendingDown size={14} />}
          label="Худшая сделка"
          value={`-$${Math.abs(analytics.worstTrade).toFixed(2)}`}
          color="coral"
          subtitle="Максимальный убыток"
        />
        <MetricCard
          icon={<AlertTriangle size={14} />}
          label="Max Drawdown"
          value={`$${analytics.maxDrawdown.toFixed(2)}`}
          color={analytics.maxDrawdown < 100 ? "mint" : "coral"}
          subtitle="Макс. просадка"
        />
      </div>

      {/* P&L breakdown */}
      <div className="rounded-lg bg-ink/[0.02] p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-ink/50">Всего P&L</span>
          <span
            className={`text-sm font-bold ${
              analytics.totalPnl >= 0 ? "text-mint" : "text-coral"
            }`}
          >
            {analytics.totalPnl >= 0 ? "+" : ""}$
            {analytics.totalPnl.toFixed(2)}
          </span>
        </div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-ink/50">Средний P&L</span>
          <span
            className={`text-sm font-bold ${
              analytics.averagePnl >= 0 ? "text-mint" : "text-coral"
            }`}
          >
            {analytics.averagePnl >= 0 ? "+" : ""}$
            {analytics.averagePnl.toFixed(2)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-ink/50">Сделок</span>
          <span className="text-sm font-bold">{analytics.totalTrades}</span>
        </div>
      </div>

      {/* Win/Loss bar */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-[10px] text-ink/50 mb-1">
          <span>Прибыльные {analytics.winningTrades}</span>
          <span>Убыточные {analytics.losingTrades}</span>
        </div>
        <div className="h-2 rounded-full bg-coral/20 overflow-hidden">
          <div
            className="h-full rounded-full bg-mint transition-all"
            style={{ width: `${analytics.winRate}%` }}
          />
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Metric card                                                        */
/* ------------------------------------------------------------------ */

function MetricCard({
  icon,
  label,
  value,
  color,
  subtitle,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: "mint" | "coral" | "steel";
  subtitle: string;
}) {
  const colorMap = {
    mint: "text-mint",
    coral: "text-coral",
    steel: "text-steel",
  };

  return (
    <div className="rounded-lg bg-ink/[0.02] p-3">
      <div className="flex items-center gap-1 mb-1">
        <span className={colorMap[color]}>{icon}</span>
        <span className="text-[10px] font-medium text-ink/50">{label}</span>
      </div>
      <p className={`text-sm font-bold ${colorMap[color]}`}>{value}</p>
      <p className="text-[10px] text-ink/40 mt-0.5">{subtitle}</p>
    </div>
  );
}
