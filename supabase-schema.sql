-- ===========================================
-- TradeMind Education — Full Schema + RLS
-- ===========================================
-- WARNING: This script drops existing tables!
-- Use on fresh setup or when schema changes.
-- ===========================================

create extension if not exists "pgcrypto";

-- ===========================================
-- Drop old tables (clean slate)
-- ===========================================

drop table if exists public.user_achievements cascade;
drop table if exists public.ai_feedback cascade;
drop table if exists public.trades cascade;
drop table if exists public.simulation_sessions cascade;
drop table if exists public.user_progress cascade;
drop table if exists public.wallet_connections cascade;
drop table if exists public.achievements cascade;
drop table if exists public.users cascade;

-- ===========================================
-- Tables
-- ===========================================

-- Пользователи
create table public.users (
  id uuid primary key default gen_random_uuid(),
  wallet_address text unique not null,
  username text,
  level text not null default 'beginner',
  sol_balance numeric not null default 0,
  total_pnl numeric not null default 0,
  total_trades int not null default 0,
  winning_trades int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Прогресс по урокам
create table public.user_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  lesson_slug text not null,
  status text not null default 'not_started',
  score int not null default 0,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(user_id, lesson_slug)
);

-- Сессии симулятора
create table public.simulation_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  scenario_id text not null,
  starting_balance numeric not null default 0,
  current_balance numeric not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

-- Сделки
create table public.trades (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.simulation_sessions(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  asset_symbol text not null,
  side text not null check (side in ('buy', 'sell')),
  order_type text not null default 'market' check (order_type in ('market', 'limit', 'stop-loss', 'take-profit')),
  entry_price numeric not null,
  exit_price numeric,
  limit_price numeric,
  take_profit numeric,
  quantity numeric not null,
  dollar_amount numeric not null,
  stop_loss numeric,
  risk_percent numeric not null default 0,
  pnl numeric,
  status text not null default 'open',
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);

-- AI Feedback
create table public.ai_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  trade_id uuid references public.trades(id) on delete set null,
  feedback_text text not null,
  risk_score int not null default 0,
  created_at timestamptz not null default now()
);

-- Достижения (справочник)
create table public.achievements (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  description text not null,
  icon text not null default '🏆',
  category text not null default 'general',
  requirement_text text not null,
  created_at timestamptz not null default now()
);

-- Достижения пользователей
create table public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  achievement_id uuid references public.achievements(id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  unique(user_id, achievement_id)
);

-- Подключения кошельков (лог)
create table public.wallet_connections (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  connected_at timestamptz not null default now(),
  user_agent text
);

-- ===========================================
-- Indexes
-- ===========================================

create index idx_users_wallet on public.users(wallet_address);
create index idx_progress_user on public.user_progress(user_id);
create index idx_progress_lesson on public.user_progress(user_id, lesson_slug);
create index idx_sessions_user on public.simulation_sessions(user_id);
create index idx_trades_session on public.trades(session_id);
create index idx_trades_user on public.trades(user_id);
create index idx_feedback_user on public.ai_feedback(user_id);
create index idx_user_achievements_user on public.user_achievements(user_id);
create index idx_wallet_connections_addr on public.wallet_connections(wallet_address);

-- ===========================================
-- Seed achievements
-- ===========================================

insert into public.achievements (slug, title, description, icon, category, requirement_text) values
  ('first-trade', 'Первая сделка', 'Открыл первую позицию в симуляторе', '🎯', 'trading', 'Открыть 1 сделку'),
  ('ten-trades', 'Десяток', 'Совершил 10 сделок', '🔟', 'trading', 'Открыть 10 сделок'),
  ('hundred-trades', 'Торговец', 'Совершил 100 сделок', '💼', 'trading', 'Открыть 100 сделок'),
  ('first-profit', 'Первая прибыль', 'Закрыл сделку с положительным P&L', '💰', 'trading', 'Закрыть сделку в плюс'),
  ('big-profit', 'Крупный выигрыш', 'Одна сделка принесла > $500', '🤑', 'trading', 'P&L > $500'),
  ('no-stop-loss', 'Самоубийца', 'Открыл 5 сделок подряд без стоп-лосса', '💀', 'risk', '5 сделок без SL'),
  ('perfect-risk', 'Мастер риска', '10 сделок подряд с риском < 2%', '🛡️', 'risk', '10 сделок с риском < 2%'),
  ('overtrader', 'Наркоман трейдинга', 'Открыл 5 сделок за минуту', '⚡', 'risk', '5 сделок за минуту'),
  ('lesson-one', 'Первый урок', 'Прошёл первый учебный модуль', '📚', 'learning', 'Завершить 1 урок'),
  ('all-lessons', 'Выпускник', 'Прошёл все учебные модули', '🎓', 'learning', 'Завершить все уроки'),
  ('wallet-connected', 'Кошелёк подключён', 'Подключил Phantom кошелёк', '🔗', 'general', 'Подключить кошелёк'),
  ('sol-whale', 'Кит', 'Баланс на кошельке > 10 SOL', '🐋', 'general', 'Баланс > 10 SOL')
on conflict (slug) do nothing;

-- ===========================================
-- RLS
-- ===========================================

alter table public.users enable row level security;
alter table public.user_progress enable row level security;
alter table public.simulation_sessions enable row level security;
alter table public.trades enable row level security;
alter table public.ai_feedback enable row level security;
alter table public.user_achievements enable row level security;
alter table public.achievements enable row level security;
alter table public.wallet_connections enable row level security;

create policy "public read users" on public.users for select using (true);
create policy "public insert users" on public.users for insert with check (true);
create policy "public update users" on public.users for update using (true);

create policy "public read progress" on public.user_progress for select using (true);
create policy "public insert progress" on public.user_progress for insert with check (true);
create policy "public update progress" on public.user_progress for update using (true);

create policy "public read sessions" on public.simulation_sessions for select using (true);
create policy "public insert sessions" on public.simulation_sessions for insert with check (true);
create policy "public update sessions" on public.simulation_sessions for update using (true);

create policy "public read trades" on public.trades for select using (true);
create policy "public insert trades" on public.trades for insert with check (true);
create policy "public update trades" on public.trades for update using (true);

create policy "public read feedback" on public.ai_feedback for select using (true);
create policy "public insert feedback" on public.ai_feedback for insert with check (true);

create policy "public read achievements" on public.achievements for select using (true);
create policy "public read user_achievements" on public.user_achievements for select using (true);
create policy "public insert user_achievements" on public.user_achievements for insert with check (true);

create policy "public read connections" on public.wallet_connections for select using (true);
create policy "public insert connections" on public.wallet_connections for insert with check (true);

-- ===========================================
-- Triggers
-- ===========================================

create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_users_updated_at
  before update on public.users
  for each row execute function update_updated_at_column();

create trigger update_progress_updated_at
  before update on public.user_progress
  for each row execute function update_updated_at_column();
