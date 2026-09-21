# TradeMind Education — Документация

## Обзор

**TradeMind Education** — образовательная платформа для обучения трейдингу на криптовалютах. Пользователи подключают Phantom кошелёк (Solana Devnet), получают виртуальный баланс и учатся торговать без реальных денег.

---

## Быстрый старт

### 1. Установка

```bash
git clone <repo-url>
cd intelligent-trading-education-mvp
npm install
```

### 2. Настройка окружения

Скопируйте `.env.example` в `.env.local`:

```bash
cp .env.example .env.local
```

Заполните переменные:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
```

### 3. Настройка Supabase

1. Создайте проект на [supabase.com](https://supabase.com)
2. Перейдите в **SQL Editor**
3. Выполните содержимое `supabase-schema.sql`
4. Скопируйте URL и anon key в `.env.local`

### 4. Запуск

```bash
npm run dev
```

Откройте http://localhost:3000

---

## Архитектура

### Структура проекта

```
intelligent-trading-education-mvp/
├── public/                    # Static assets
├── src/
│   ├── app/                   # Next.js App Router
│   │   ├── layout.tsx         # Root layout
│   │   ├── page.tsx           # Главная страница (табы)
│   │   ├── globals.css        # Глобальные стили
│   │   └── api/route.ts       # Server-side API
│   ├── components/            # React компоненты
│   │   ├── Achievements.tsx   # Вкладка достижений
│   │   ├── LessonList.tsx     # Список уроков
│   │   ├── MentorPanel.tsx    # Наставник (rule-based)
│   │   ├── Simulator.tsx      # Трейдинг-симулятор
│   │   ├── UserStats.tsx      # Статистика пользователя
│   │   └── WalletConnect.tsx  # Подключение Phantom
│   ├── data/                  # Данные
│   │   ├── lessons.ts         # Учебные модули
│   │   └── scenarios.ts       # Торговые сценарии
│   └── lib/                   # Библиотеки
│       ├── mentor.ts          # Анализ сделок
│       ├── phantom.ts         # Phantom wallet интеграция
│       ├── supabase.ts        # Supabase клиент
│       └── types.ts           # TypeScript типы
├── supabase-schema.sql        # SQL схема БД
├── vercel.json                # Конфигурация Vercel
├── .env.example               # Пример .env
└── package.json               # Зависимости
```

### Стек технологий

| Слой | Технология | Версия |
|------|-----------|--------|
| Frontend | Next.js | 15.5 |
| UI Framework | React | 19.1 |
| Язык | TypeScript | 5.7 |
| Стили | Tailwind CSS | 3.4 |
| Графики | Recharts | 2.15 |
| Иконки | Lucide React | 0.468 |
| БД | Supabase | 2.56 |
| Кошелёк | Phantom (Solana) | Devnet |
| Деплой | Vercel | — |

---

## Компоненты

### WalletConnect

Подключение Phantom кошелька и получение баланса с Devnet.

```tsx
<WalletConnect
  walletAddress={string | null}
  onConnect={(address: string) => void}
  onDisconnect={() => void}
/>
```

**Функции:**
- `connectPhantomWallet()` — подключение кошелька
- `disconnectPhantomWallet()` — отключение
- `getSolBalance()` — получение баланса SOL с devnet
- `signMessage(message)` — подпись сообщения для аутентификации

### Simulator

Трейдинг-симулятор с реальными ценами (BTC, ETH, SOL) и 4 типами ордеров.

```tsx
<Simulator
  onFeedback={(feedback: MentorFeedback[]) => void}
  onClosedPosition={(pos: ClosedPosition) => void}
  walletAddress={string | null}
  onBalanceChange={(balance: number) => void}
/>
```

**Функции:**
- Random walk генерация свечей (без циклов)
- **4 типа ордеров**: Market, Limit, Stop-Loss, Take-Profit
- Открытие/закрытие позиций (Buy/Sell)
- Автоматическое исполнение лимитных и стоп-ордеров
- Расчёт P&L в реальном времени
- Сохранение сделок в Supabase
- Автоматическая проверка достижений
- Toast-уведомления

### Portfolio

Отслеживание позиций и Equity Curve.

```tsx
<Portfolio
  closedPositions={ClosedPosition[]}
  currentPnl={number}
  totalCapital={number}
/>
```

**Метрики:**
- Нереализованный P&L
- Реализованный P&L
- Винрейт
- Среднее время удержания
- Equity curve (график капитала)
- Последние 10 сделок

### Analytics

Продвинутая аналитика сделок.

```tsx
<Analytics closedPositions={ClosedPosition[]} />
```

**Метрики:**
- Win Rate
- Profit Factor
- Sharpe Ratio
- Max Drawdown
- Лучшая / худшая сделка
- Средний P&L
- Визуальная шкала Win/Loss

### MentorPanel

Rule-based наставник, анализирующий сделки.

```tsx
<MentorPanel feedback={MentorFeedback[]} />
```

**Проверки:**
- Нет стоп-лосса → предупреждение
- Риск > 3% → предупреждение
- Overtrading (5+ сделок за минуту) → предупреждение
- Крупная позиция (> $5000) → предупреждение

### Achievements

Система достижений (12 штук).

```tsx
<Achievements walletAddress={string | null} />
```

**Категории:**
- 🎯 Трейдинг (5 достижений)
- 🛡️ Управление рисками (3 достижения)
- 📚 Обучение (2 достижения)
- 🔗 Общие (2 достижения)

### UserStats

Статистика пользователя.

```tsx
<UserStats walletAddress={string | null} />
```

**Метрики:**
- Баланс SOL
- Винрейт
- Количество сделок
- Количество достижений
- Прогресс по урокам
- Общий P&L

### Toast

Система уведомлений.

```tsx
const { addToast } = useToast();

addToast({
  type: "success" | "error" | "info" | "achievement",
  title: "Заголовок",
  message: "Описание",
  duration: 4000, // мс
});
```

**Типы:**
- `success` — зелёный (открытие/закрытие сделки)
- `error` — красный (убыточная сделка)
- `info` — серый (создание ордера)
- `achievement` — золотой (получение достижения)

---

## База данных

### Таблицы

| Таблица | Описание |
|---------|----------|
| `users` | Пользователи (кошелёк, баланс, статистика) |
| `user_progress` | Прогресс по урокам |
| `simulation_sessions` | Сессии симулятора |
| `trades` | Сделки |
| `ai_feedback` | Feedback от наставника |
| `achievements` | Справочник достижений |
| `user_achievements` | Полученные достижения |
| `wallet_connections` | Лог подключений |

### RLS Policies

Все таблицы защищены Row Level Security. Для MVP используются политики "public read/write" (без Auth).

---

## API

### Server-side API (`/api`)

POST-запросы с action:

| Action | Описание |
|--------|----------|
| `getProfile` | Получить профиль пользователя |
| `getProgress` | Получить прогресс по урокам |
| `getStats` | Получить статистику |

---

## Деплой

### Vercel

```bash
npm i -g vercel
vercel login
vercel --prod
```

### Переменные окружения в Vercel

| Переменная | Описание |
|-----------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL проекта Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key Supabase |

---

## Development

### Команды

```bash
npm run dev          # Dev server
npm run build        # Production build
npm run start        # Production server
npm run lint         # ESLint
npm run typecheck    # TypeScript check
```

### Добавление нового достижения

1. Добавьте запись в `supabase-schema.sql` (секция seed)
2. Обновите `FALLBACK_ACHIEVEMENTS` в `Achievements.tsx`
3. Добавьте проверку в `checkAndUnlockAchievements()` в `supabase.ts`

### Добавление нового сценария

1. Добавьте объект в `src/data/scenarios.ts`
2. Укажите реалистичные цены (проверьте на CoinMarketCap)
3. Настройте волатильность в `VOLATILITY` в `Simulator.tsx`

---

## Известные ограничения

1. **Нет реальной авторизации** — используется wallet-based подход без Supabase Auth
2. **Devnet SOL** — баланс не является реальными деньгами
3. **Нет реальных рыночных данных** — цены генерируются random walk
4. **Нет оффлайн-режима** — требуется подключение к интернету
5. **Нет мобильного приложения** — только веб

---

## Лицензия

MIT
