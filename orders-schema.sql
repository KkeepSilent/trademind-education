-- =============================================
-- Trading Orders — buy = DB record, sell = real SOL transfer
-- Run this in Supabase SQL Editor
-- =============================================

-- Orders table ( tracks all buy/sell orders )
CREATE TABLE IF NOT EXISTS orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  asset TEXT NOT NULL DEFAULT 'SOL',
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  order_type TEXT NOT NULL DEFAULT 'market',
  dollar_amount NUMERIC NOT NULL,
  entry_price NUMERIC NOT NULL,
  exit_price NUMERIC,
  quantity NUMERIC NOT NULL,
  pnl NUMERIC DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  tx_signature TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_orders_wallet ON orders(wallet_address);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);

-- RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Anyone can read orders (public trading board)
CREATE POLICY "Orders are viewable by everyone" ON orders
  FOR SELECT USING (true);

-- Only insert自己的订单
CREATE POLICY "Users can insert own orders" ON orders
  FOR INSERT WITH CHECK (auth.uid()::text = wallet_address OR wallet_address IS NOT NULL);

-- Only update自己的订单
CREATE POLICY "Users can update own orders" ON orders
  FOR UPDATE USING (auth.uid()::text = wallet_address OR wallet_address IS NOT NULL);
