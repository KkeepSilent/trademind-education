export type Candle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type Scenario = {
  id: string;
  title: string;
  asset: string;
  description: string;
  lessonFocus: string;
  candles: Candle[];
};

export type TradeSide = "buy" | "sell";

/** Order types like in Investopedia */
export type OrderType = "market" | "limit" | "stop-loss" | "take-profit";

export type Trade = {
  id: string;
  side: TradeSide;
  asset: string;
  entryPrice: number;
  quantity: number;
  stopLoss?: number;
  riskPercent: number;
  createdAt: string;
};

export type MentorFeedback = {
  title: string;
  message: string;
  riskScore: number;
};

export type Lesson = {
  slug: string;
  title: string;
  description: string;
  duration: string;
  status: "ready" | "locked" | "done";
};

/** Portfolio position with live P&L */
export type PortfolioPosition = {
  id: string;
  side: TradeSide;
  asset: string;
  entryPrice: number;
  currentPrice: number;
  dollarAmount: number;
  quantity: number;
  orderType: OrderType;
  limitPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  riskPercent: number;
  pnl: number;
  pnlPercent: number;
  openedAt: string;
  dbTradeId?: string;
};

/** Closed position with final P&L */
export type ClosedPosition = PortfolioPosition & {
  exitPrice: number;
  closedAt: string;
  duration: number; // seconds
  txSignature?: string;
};

/** Analytics summary */
export type TradeAnalytics = {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnl: number;
  averagePnl: number;
  bestTrade: number;
  worstTrade: number;
  profitFactor: number;
  maxDrawdown: number;
  averageHoldTime: number; // seconds
  sharpeRatio: number;
};
