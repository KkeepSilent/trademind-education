"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  PlayCircle,
  Save,
  TrendingDown,
  TrendingUp,
  RefreshCw,
  Target,
  ShieldAlert,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { scenarios } from "@/data/scenarios";
import { analyzeTrade } from "@/lib/mentor";
import {
  saveTrade,
  closeTrade,
  createSimulationSession,
  saveAIFeedback,
  incrementTradeStats,
  checkAndUnlockAchievements,
  updateSolBalance,
  createOrder,
  closeOrder,
} from "@/lib/supabase";
import { getSolBalance } from "@/lib/phantom";
import { buySol, sellSol, getAdminBalance } from "@/lib/trading";
import type {
  Candle,
  MentorFeedback,
  Scenario,
  Trade,
  ClosedPosition,
  OrderType,
} from "@/lib/types";
import { useToast } from "./Toast";

/* ------------------------------------------------------------------ */
/*  Props & constants                                                  */
/* ------------------------------------------------------------------ */

type SimulatorProps = {
  onFeedback: (feedback: MentorFeedback[]) => void;
  onClosedPosition?: (pos: ClosedPosition) => void;
  walletAddress: string | null;
  onBalanceChange?: (balance: number) => void;
};

const QUOTE_INTERVAL_MS = 4_000;
const VISIBLE_CANDLE_COUNT = 24;
const MAX_CANDLES = 120;
const SOL_USD_RATE = 140;

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type LiveCandle = Candle & {
  sequence: number;
  label: string;
};

type OpenPosition = {
  id: string;
  dbTradeId?: string;
  txSignature?: string;
  side: "buy" | "sell";
  asset: string;
  entryPrice: number;
  dollarAmount: number;
  quantity: number;
  orderType: OrderType;
  limitPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  riskPercent: number;
  openedAt: string;
};

/* ------------------------------------------------------------------ */
/*  Scenario selector                                                  */
/* ------------------------------------------------------------------ */

function ScenarioSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {scenarios.map((s) => (
        <button
          key={s.id}
          onClick={() => onChange(s.id)}
          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
            value === s.id
              ? "border-ink bg-ink text-white"
              : "border-ink/10 bg-white/72 text-ink/60 hover:border-ink/25"
          }`}
          type="button"
        >
          {s.title}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Order type selector                                                */
/* ------------------------------------------------------------------ */

const ORDER_TYPES: { id: OrderType; label: string; icon: React.ReactNode; desc: string }[] = [
  { id: "market", label: "Рыночный", icon: <Zap size={14} />, desc: "Сейчас" },
  { id: "limit", label: "Лимитный", icon: <Target size={14} />, desc: "Ждать цену" },
  { id: "stop-loss", label: "Стоп-лосс", icon: <ShieldAlert size={14} />, desc: "Защита" },
  { id: "take-profit", label: "Тейк-профит", icon: <TrendingUp size={14} />, desc: "Цель" },
];

function OrderTypeSelector({
  value,
  onChange,
}: {
  value: OrderType;
  onChange: (type: OrderType) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {ORDER_TYPES.map((ot) => (
        <button
          key={ot.id}
          onClick={() => onChange(ot.id)}
          className={`flex flex-col items-center gap-0.5 rounded-lg border px-2 py-2 text-[10px] font-medium transition ${
            value === ot.id
              ? "border-ink bg-ink text-white"
              : "border-ink/10 bg-white/72 text-ink/50 hover:border-ink/25"
          }`}
          type="button"
        >
          {ot.icon}
          {ot.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function Simulator({
  onFeedback,
  onClosedPosition,
  walletAddress,
  onBalanceChange,
}: SimulatorProps) {
  const { addToast } = useToast();

  /* — state — */
  const [scenarioId, setScenarioId] = useState(scenarios[0].id);
  const scenario = scenarios.find((s) => s.id === scenarioId) ?? scenarios[0];
  const [liveCandles, setLiveCandles] = useState<LiveCandle[]>(() =>
    createInitialCandles(scenario)
  );
  const [positions, setPositions] = useState<OpenPosition[]>([]);
  const [dollarAmount, setDollarAmount] = useState<number>(50);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [limitPrice, setLimitPrice] = useState<string>("");
  const [stopLossInput, setStopLossInput] = useState<string>("");
  const [takeProfitInput, setTakeProfitInput] = useState<string>("");
  const [riskPercent, setRiskPercent] = useState(1);
  const [tradeError, setTradeError] = useState("");
  const [feedbackList, setFeedbackList] = useState<MentorFeedback[]>([]);

  /* — supabase session — */
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessionCreatedFor = useRef<string | null>(null);

  /* — balance — */
  const [solBalance, setSolBalance] = useState(0);
  const [adminBalance, setAdminBalance] = useState(0);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [txPending, setTxPending] = useState(false);

  /* — derived — */
  const activeCandle =
    liveCandles.at(-1) ?? createInitialCandles(scenario).at(-1)!;
  const previousCandle = liveCandles.at(-2);
  const currentPrice = activeCandle.close;
  const priceDelta = previousCandle ? currentPrice - previousCandle.close : 0;
  const priceDeltaPercent = previousCandle
    ? (priceDelta / previousCandle.close) * 100
    : 0;

  const balanceUsd = solBalance * SOL_USD_RATE;
  const usedCapital = useMemo(
    () => positions.reduce((sum, p) => sum + p.dollarAmount, 0),
    [positions]
  );
  const availableBalance = Math.max(balanceUsd - usedCapital, 0);

  const visibleCandles = useMemo(
    () => liveCandles.slice(-VISIBLE_CANDLE_COUNT),
    [liveCandles]
  );

  const quantityTokens =
    dollarAmount > 0 && currentPrice > 0 ? dollarAmount / currentPrice : 0;
  const canOpenTrade =
    dollarAmount > 0 && dollarAmount <= availableBalance && currentPrice > 0;

  const priceMin = useMemo(() => {
    const lows = visibleCandles.map((c) => c.low);
    return Math.min(...lows) * 0.998;
  }, [visibleCandles]);
  const priceMax = useMemo(() => {
    const highs = visibleCandles.map((c) => c.high);
    return Math.max(...highs) * 1.002;
  }, [visibleCandles]);

  const priceFormat = useMemo(
    () =>
      currentPrice > 1000
        ? (v: number) => v.toFixed(0)
        : (v: number) => v.toFixed(2),
    [currentPrice]
  );

  /* ---------------------------------------------------------------- */
  /*  Fetch balances — ALWAYS fetch both user + admin                  */
  /* ---------------------------------------------------------------- */

  async function refreshBalance() {
    if (!walletAddress) return;
    setLoadingBalance(true);
    try {
      // Always fetch user balance
      const bal = await getSolBalance();
      setSolBalance(bal);
      await updateSolBalance(walletAddress, bal);
      onBalanceChange?.(bal);

      // Always fetch admin balance (no Phantom connection needed)
      try {
        const adminBal = await getAdminBalance();
        setAdminBalance(adminBal);
        console.log(`[Simulator] Admin balance: ${adminBal} SOL`);
      } catch (e) {
        console.error("[Simulator] Admin balance fetch failed:", e);
      }
    } catch (e) {
      console.error("Balance fetch failed:", e);
    } finally {
      setLoadingBalance(false);
    }
  }

  useEffect(() => {
    if (walletAddress) {
      refreshBalance();
    } else {
      setSolBalance(0);
      setAdminBalance(0);
    }
  }, [walletAddress]);

  /* ---------------------------------------------------------------- */
  /*  Effects                                                          */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    setLiveCandles(createInitialCandles(scenario));
    setTradeError("");
  }, [scenario]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setLiveCandles((prev) => appendNextCandle(prev, scenario));
    }, QUOTE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [scenario]);

  // Auto-check limit/stop orders every tick
  useEffect(() => {
    if (positions.length === 0) return;

    setPositions((prev) => {
      const toClose: OpenPosition[] = [];
      const remaining: OpenPosition[] = [];

      for (const pos of prev) {
        const shouldClose = checkAutoClose(pos, currentPrice);
        if (shouldClose) {
          toClose.push(pos);
        } else {
          remaining.push(pos);
        }
      }

      for (const pos of toClose) {
        handleClosePosition(pos, currentPrice);
      }

      return remaining;
    });
  }, [currentPrice]);

  // Create supabase session
  useEffect(() => {
    if (!walletAddress) {
      setSessionId(null);
      sessionCreatedFor.current = null;
      return;
    }
    if (sessionCreatedFor.current === scenarioId) return;
    sessionCreatedFor.current = scenarioId;

    createSimulationSession(walletAddress, scenarioId, balanceUsd).then(
      (res) => {
        if (res.mode === "supabase" && res.session) {
          setSessionId(res.session.id);
        }
      }
    ).catch((err) => {
      console.error("Session creation failed:", err);
    });
  }, [walletAddress, scenarioId]);

  /* ---------------------------------------------------------------- */
  /*  Auto-close check for limit/stop orders                           */
  /* ---------------------------------------------------------------- */

  function checkAutoClose(pos: OpenPosition, price: number): boolean {
    if (pos.orderType === "limit") {
      if (pos.side === "buy" && pos.limitPrice && price <= pos.limitPrice) return true;
      if (pos.side === "sell" && pos.limitPrice && price >= pos.limitPrice) return true;
    }
    if (pos.orderType === "stop-loss" || pos.stopLoss) {
      if (pos.side === "buy" && pos.stopLoss && price <= pos.stopLoss) return true;
      if (pos.side === "sell" && pos.stopLoss && price >= pos.stopLoss) return true;
    }
    if (pos.orderType === "take-profit" || pos.takeProfit) {
      if (pos.side === "buy" && pos.takeProfit && price >= pos.takeProfit) return true;
      if (pos.side === "sell" && pos.takeProfit && price <= pos.takeProfit) return true;
    }
    return false;
  }

  /* ---------------------------------------------------------------- */
  /*  Trade actions — ALWAYS real blockchain                           */
  /* ---------------------------------------------------------------- */

  async function handleOpenTrade() {
    if (!canOpenTrade) return;
    if (txPending) return;

    const parsedStop = stopLossInput ? parseFloat(stopLossInput) : undefined;
    const parsedTP = takeProfitInput ? parseFloat(takeProfitInput) : undefined;

    // Convert dollar amount to SOL for blockchain transfer
    const solAmount = dollarAmount / SOL_USD_RATE;

    const position: OpenPosition = {
      id: crypto.randomUUID(),
      side,
      asset: scenario.asset,
      entryPrice: currentPrice,
      dollarAmount,
      quantity: quantityTokens,
      orderType,
      limitPrice: orderType === "limit" ? parseFloat(limitPrice) : undefined,
      stopLoss: parsedStop,
      takeProfit: parsedTP,
      riskPercent,
      openedAt: new Date().toISOString(),
    };

    const tempTrade: Trade = {
      id: position.id,
      side: position.side,
      asset: position.asset,
      entryPrice: position.entryPrice,
      quantity: position.quantity,
      stopLoss: position.stopLoss,
      riskPercent: position.riskPercent,
      createdAt: position.openedAt,
    };

    const feedback = analyzeTrade(tempTrade, []);
    setFeedbackList(feedback);
    onFeedback(feedback);

    // BUY = DB order only (no blockchain transaction needed)
    let dbOrderId: string | undefined;
    if (side === "buy" && walletAddress) {
      setTxPending(true);
      try {
        addToast({
          type: "info",
          title: "📋 Ордер создаётся...",
          message: `Покупка ${solAmount.toFixed(4)} SOL по $${currentPrice.toFixed(2)}`,
          duration: 3000,
        });

        // Save order to Supabase
        const order = await createOrder({
          wallet_address: walletAddress,
          asset: position.asset,
          side: "buy",
          order_type: position.orderType,
          dollar_amount: position.dollarAmount,
          entry_price: position.entryPrice,
          quantity: position.quantity,
        });

        if (order) {
          dbOrderId = order.id;
          addToast({
            type: "success",
            title: "✅ Ордер создан",
            message: `Покупка ${position.asset} — $${position.dollarAmount} по $${currentPrice.toFixed(2)}`,
            duration: 5000,
          });
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        addToast({
          type: "error",
          title: "❌ Ошибка создания ордера",
          message: errorMsg,
          duration: 6000,
        });
        setTxPending(false);
        return;
      }
      setTxPending(false);
    }

    // Add position
    if (orderType === "market") {
      setPositions((prev) => [{ ...position, dbTradeId: dbOrderId }, ...prev]);
      setTradeError("");

      addToast({
        type: "success",
        title: `${side === "buy" ? "🟢 Куплено" : "🔴 Продано"}`,
        message: `${quantityTokens.toFixed(4)} ${scenario.asset} по $${currentPrice.toFixed(2)}`,
      });
    } else {
      setPositions((prev) => [{ ...position, dbTradeId: dbOrderId }, ...prev]);
      setTradeError("");

      const orderLabel =
        orderType === "limit" ? `Лимит ${limitPrice}` :
        orderType === "stop-loss" ? `Стоп ${stopLossInput}` :
        `Тейк ${takeProfitInput}`;

      addToast({
        type: "info",
        title: `📋 Ордер создан`,
        message: `${side === "buy" ? "Покупка" : "Продажа"} ${scenario.asset} — ${orderLabel}`,
      });
    }

    // Reset form
    setDollarAmount(50);
    setStopLossInput("");
    setTakeProfitInput("");
    setLimitPrice("");
  }

  async function handleClosePosition(pos: OpenPosition, exitPrice: number) {
    if (txPending) return;

    const pnl =
      pos.side === "buy"
        ? (exitPrice - pos.entryPrice) * pos.quantity
        : (pos.entryPrice - exitPrice) * pos.quantity;

    const duration = Math.round(
      (Date.now() - new Date(pos.openedAt).getTime()) / 1000
    );

    // Calculate only PROFIT in SOL (not the full position)
    const pnlSol = pnl / SOL_USD_RATE;

    // Execute blockchain transaction for SELL — send PROFIT from admin wallet
    let txSignature: string | undefined;
    if (walletAddress && pnlSol > 0) {
      setTxPending(true);
      try {
        addToast({
          type: "info",
          title: "⛓️ Отправка прибыли...",
          message: `Отправка ${pnlSol.toFixed(4)} SOL прибыли на ваш кошелёк`,
          duration: 3000,
        });

        txSignature = await sellSol(pnlSol, walletAddress);

        addToast({
          type: "success",
          title: "✅ Прибыль получена",
          message: `${pnlSol.toFixed(4)} SOL отправлено на кошелёк`,
          duration: 5000,
        });

        setTimeout(refreshBalance, 2000);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        addToast({
          type: "error",
          title: "❌ Ошибка отправки прибыли",
          message: errorMsg,
          duration: 6000,
        });
      }
      setTxPending(false);
    } else if (walletAddress && pnlSol <= 0) {
      // Loss — no SOL transfer needed
      addToast({
        type: "info",
        title: "📉 Позиция закрыта с убытком",
        message: `PnL: $${pnl.toFixed(2)} (${pnlSol.toFixed(4)} SOL)`,
        duration: 4000,
      });
    }

    const closedPos: ClosedPosition = {
      ...pos,
      currentPrice: exitPrice,
      pnl,
      pnlPercent: pos.entryPrice > 0 ? (pnl / pos.dollarAmount) * 100 : 0,
      exitPrice,
      closedAt: new Date().toISOString(),
      duration,
      txSignature,
    };

    // Save to Supabase
    if (pos.dbTradeId) {
      try {
        await closeTrade(pos.dbTradeId, exitPrice, pnl);
      } catch (err) {
        console.error("Failed to close trade:", err);
      }
    }

    if (walletAddress) {
      try {
        await incrementTradeStats(walletAddress, pnl);
        const newAchievements = await checkAndUnlockAchievements(walletAddress);
        if (newAchievements.length > 0) {
          for (const slug of newAchievements) {
            addToast({
              type: "achievement",
              title: "🏆 Достижение получено!",
              message: slug.replace(/-/g, " "),
              duration: 6000,
            });
          }
        }
      } catch (err) {
        console.error("Failed to update stats:", err);
      }
    }

    onClosedPosition?.(closedPos);

    addToast({
      type: pnl >= 0 ? "success" : "error",
      title: pnl >= 0 ? "✅ Сделка закрыта" : "❌ Сделка закрыта",
      message: `${pos.side === "buy" ? "Покупка" : "Продажа"} ${pos.asset} — P&L: ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}`,
    });

    setPositions((prev) => prev.filter((p) => p.id !== pos.id));
  }

  /* ---------------------------------------------------------------- */
  /*  Manual close                                                     */
  /* ---------------------------------------------------------------- */

  function closeManually(pos: OpenPosition) {
    handleClosePosition(pos, currentPrice);
  }

  /* ---------------------------------------------------------------- */
  /*  Pending orders display                                           */
  /* ---------------------------------------------------------------- */

  const pendingOrders = positions.filter((p) => p.orderType !== "market");
  const activePositions = positions.filter((p) => p.orderType === "market");

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <section className="panel rounded-lg p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity size={18} className="text-steel" />
          <h2 className="text-base font-bold">Симулятор</h2>
        </div>
        <button
          onClick={refreshBalance}
          className="flex items-center gap-1 text-xs text-ink/40 hover:text-ink/70 transition"
          type="button"
          disabled={loadingBalance || !walletAddress}
        >
          <RefreshCw size={12} className={loadingBalance ? "animate-spin" : ""} />
          Обновить
        </button>
      </div>

      {/* Scenario selector */}
      <ScenarioSelector value={scenarioId} onChange={setScenarioId} />

      {/* Description */}
      <p className="mt-2 text-xs text-ink/45 leading-relaxed">
        {scenario.description}
      </p>

      {/* Chart */}
      <div className="mt-4 h-[200px] rounded-xl bg-ink/[0.02] p-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={visibleCandles}>
            <defs>
              <linearGradient id={`grad-${scenarioId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#88d4ab" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#88d4ab" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis
              domain={[priceMin, priceMax]}
              tick={{ fontSize: 10 }}
              tickFormatter={priceFormat}
              width={60}
            />
            <Tooltip
              formatter={(value: number) => [`$${priceFormat(value as number)}`, "Цена"]}
            />
            <Area
              type="monotone"
              dataKey="close"
              stroke="#88d4ab"
              fill={`url(#grad-${scenarioId})`}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Price display */}
      <div className="mt-3 flex items-center gap-3">
        <span className="text-2xl font-black tabular-nums">
          ${priceFormat(currentPrice)}
        </span>
        <span
          className={`flex items-center gap-1 text-sm font-semibold ${
            priceDelta >= 0 ? "text-mint" : "text-coral"
          }`}
        >
          {priceDelta >= 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
          {priceDelta >= 0 ? "+" : ""}
          {priceDeltaPercent.toFixed(2)}%
        </span>
      </div>

      {/* Balance info */}
      <div className="mt-3 space-y-1.5">
        <div className="flex items-center justify-between text-xs text-ink/50">
          <span>Ваш баланс:</span>
          <span className="font-medium">{solBalance.toFixed(4)} SOL (${balanceUsd.toFixed(2)})</span>
        </div>
        <div className="flex items-center justify-between text-xs text-ink/50">
          <span>Доступно для торговли:</span>
          <span className="font-medium">${availableBalance.toFixed(2)}</span>
        </div>
      </div>

      {/* Admin wallet info — always visible */}
      <div className="mt-2 rounded-lg bg-ink/[0.03] px-3 py-2">
        <div className="flex items-center justify-between text-[10px] text-ink/40">
          <span>Биржа (ликвидность):</span>
          <a
            href={`https://explorer.solana.com/address/DcsW1hiunJC4SW897Dje542L19aJMAFpMVv1KA51gTw9?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-steel hover:underline"
          >
            DcsW...gTw9 ↗
          </a>
        </div>
        <div className="flex items-center justify-between text-[10px] text-ink/40 mt-0.5">
          <span>Баланс биржи:</span>
          <span className={`font-medium ${adminBalance > 1 ? "text-mint" : "text-coral"}`}>
            {adminBalance.toFixed(4)} SOL (${(adminBalance * SOL_USD_RATE).toFixed(2)})
          </span>
        </div>
        {adminBalance < 0.1 && adminBalance > 0 && (
          <div className="mt-1.5 rounded bg-amber-50 border border-amber-200/50 px-2 py-1.5">
            <p className="text-[10px] text-amber-700">
              ⚠️ Пополните биржу через{' '}
              <a
                href="https://faucet.solana.com"
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold underline"
              >
                faucet.solana.com
              </a>
            </p>
          </div>
        )}
      </div>

      {/* Pending orders */}
      {pendingOrders.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-300/30 bg-amber-50/50 p-3">
          <h3 className="text-xs font-semibold text-amber-700 mb-2">
            📋 Ожидающие ордера ({pendingOrders.length})
          </h3>
          <div className="space-y-1.5">
            {pendingOrders.map((pos) => (
              <div
                key={pos.id}
                className="flex items-center justify-between rounded bg-white/60 px-2 py-1.5"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                      pos.side === "buy"
                        ? "bg-mint/20 text-mint"
                        : "bg-coral/20 text-coral"
                    }`}
                  >
                    {pos.side}
                  </span>
                  <span className="text-xs">{pos.asset}</span>
                  <span className="text-[10px] text-ink/40">
                    {pos.orderType === "limit" && `@ $${pos.limitPrice}`}
                    {pos.orderType === "stop-loss" && `SL $${pos.stopLoss}`}
                    {pos.orderType === "take-profit" && `TP $${pos.takeProfit}`}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setPositions((prev) => prev.filter((p) => p.id !== pos.id));
                    addToast({
                      type: "info",
                      title: "Ордер отменён",
                    });
                  }}
                  className="text-[10px] text-coral hover:text-coral/70"
                  type="button"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active positions */}
      {activePositions.length > 0 && (
        <div className="mt-4 rounded-lg border border-ink/10 bg-white/50 p-3">
          <h3 className="text-xs font-semibold text-ink/50 mb-2">
            📈 Открытые позиции ({activePositions.length})
          </h3>
          <div className="space-y-1.5">
            {activePositions.map((pos) => {
              const unrealizedPnl =
                pos.side === "buy"
                  ? (currentPrice - pos.entryPrice) * pos.quantity
                  : (pos.entryPrice - currentPrice) * pos.quantity;

              return (
                <div
                  key={pos.id}
                  className="flex items-center justify-between rounded bg-ink/[0.02] px-3 py-2"
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
                    <span className="text-[10px] text-ink/40">
                      @ ${pos.entryPrice.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-bold ${
                        unrealizedPnl >= 0 ? "text-mint" : "text-coral"
                      }`}
                    >
                      {unrealizedPnl >= 0 ? "+" : ""}$
                      {unrealizedPnl.toFixed(2)}
                    </span>
                    <button
                      onClick={() => closeManually(pos)}
                      className="rounded bg-coral/10 px-2 py-1 text-[10px] font-medium text-coral hover:bg-coral/20 transition"
                      type="button"
                    >
                      Закрыть
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Trade form */}
      <div className="mt-4 space-y-3">
        {/* Order type */}
        <OrderTypeSelector value={orderType} onChange={setOrderType} />

        {/* Side */}
        <div className="flex gap-2">
          <button
            onClick={() => setSide("buy")}
            className={`flex-1 flex items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-bold transition ${
              side === "buy"
                ? "border-mint bg-mint/10 text-mint"
                : "border-ink/10 bg-white/72 text-ink/40 hover:border-ink/25"
            }`}
            type="button"
          >
            <TrendingUp size={16} /> Покупка
          </button>
          <button
            onClick={() => setSide("sell")}
            className={`flex-1 flex items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-bold transition ${
              side === "sell"
                ? "border-coral bg-coral/10 text-coral"
                : "border-ink/10 bg-white/72 text-ink/40 hover:border-ink/25"
            }`}
            type="button"
          >
            <TrendingDown size={16} /> Продажа
          </button>
        </div>

        {/* Amount */}
        <div>
          <label className="block text-xs font-medium text-ink/50 mb-1">
            Сумма ($)
          </label>
          <input
            type="number"
            value={dollarAmount}
            onChange={(e) => setDollarAmount(Math.max(0, Number(e.target.value)))}
            min={1}
            step={5}
            className="w-full rounded-lg border border-ink/10 bg-white/72 px-3 py-2 text-sm font-medium outline-none focus:border-ink/30"
          />
          <p className="mt-1 text-[10px] text-ink/40">
            ≈ {quantityTokens.toFixed(4)} {scenario.asset} ({(dollarAmount / SOL_USD_RATE).toFixed(4)} SOL)
          </p>
        </div>

        {/* Limit price */}
        {orderType === "limit" && (
          <div>
            <label className="block text-xs font-medium text-ink/50 mb-1">
              Лимитная цена ($)
            </label>
            <input
              type="number"
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
              min={0}
              step={0.01}
              placeholder={`Текущая: $${currentPrice.toFixed(2)}`}
              className="w-full rounded-lg border border-ink/10 bg-white/72 px-3 py-2 text-sm font-medium outline-none focus:border-ink/30"
            />
          </div>
        )}

        {/* Stop Loss & Take Profit */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-ink/50 mb-1">
              Стоп-лосс ($)
            </label>
            <input
              type="number"
              value={stopLossInput}
              onChange={(e) => setStopLossInput(e.target.value)}
              min={0}
              step={0.01}
              placeholder="Опционально"
              className="w-full rounded-lg border border-ink/10 bg-white/72 px-3 py-2 text-sm font-medium outline-none focus:border-ink/30"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink/50 mb-1">
              Тейк-профит ($)
            </label>
            <input
              type="number"
              value={takeProfitInput}
              onChange={(e) => setTakeProfitInput(e.target.value)}
              min={0}
              step={0.01}
              placeholder="Опционально"
              className="w-full rounded-lg border border-ink/10 bg-white/72 px-3 py-2 text-sm font-medium outline-none focus:border-ink/30"
            />
          </div>
        </div>

        {/* Risk % */}
        <div>
          <label className="block text-xs font-medium text-ink/50 mb-1">
            Риск: {riskPercent}%
          </label>
          <input
            type="range"
            min={0.5}
            max={5}
            step={0.5}
            value={riskPercent}
            onChange={(e) => setRiskPercent(parseFloat(e.target.value))}
            className="w-full accent-ink"
          />
        </div>

        {/* Error */}
        {tradeError && (
          <p className="text-xs text-coral">{tradeError}</p>
        )}

        {/* Open trade button */}
        <button
          onClick={handleOpenTrade}
          disabled={!canOpenTrade || txPending}
          className={`flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-bold transition ${
            canOpenTrade && !txPending
              ? "bg-ink text-white hover:bg-ink/90"
              : "bg-ink/10 text-ink/30 cursor-not-allowed"
          }`}
          type="button"
        >
          {txPending ? (
            <>
              <RefreshCw size={16} className="animate-spin" />
              Отправка трансакции...
            </>
          ) : (
            <>
              <PlayCircle size={16} />
              {orderType === "market"
                ? `Купить ${scenario.asset} за $${dollarAmount}`
                : `Создать ордер`}
            </>
          )}
        </button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Candle helpers                                                     */
/* ------------------------------------------------------------------ */

function createInitialCandles(scenario: Scenario): LiveCandle[] {
  const now = Date.now();
  return scenario.candles.slice(-MAX_CANDLES).map((c, i) => ({
    ...c,
    sequence: i,
    label: new Date(now - (scenario.candles.length - i) * QUOTE_INTERVAL_MS)
      .toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
  }));
}

function appendNextCandle(prev: LiveCandle[], scenario: Scenario): LiveCandle[] {
  const last = prev.at(-1);
  if (!last) return createInitialCandles(scenario);

  const vol = scenario.asset === "SOL" ? 0.025 : scenario.asset === "ETH" ? 0.015 : 0.012;
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const drift = (Math.random() - 0.5) * 0.001;
  const ret = drift + z * vol;

  const open = last.close;
  const close = open * (1 + ret);
  const wick = Math.abs(ret) * open * (0.3 + Math.random() * 0.5);
  const high = Math.max(open, close) + wick * Math.random();
  const low = Math.min(open, close) - wick * Math.random();
  const volume = Math.round(50 + Math.random() * 200);

  const next: LiveCandle = {
    time: new Date().toISOString(),
    open: +open.toFixed(2),
    high: +high.toFixed(2),
    low: +low.toFixed(2),
    close: +close.toFixed(2),
    volume,
    sequence: last.sequence + 1,
    label: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
  };

  const updated = [...prev, next];
  return updated.length > MAX_CANDLES ? updated.slice(-MAX_CANDLES) : updated;
}
