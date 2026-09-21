# TradeMind Education — Руководство разработчика

## Добавление нового компонента

### 1. Создайте файл

```tsx
// src/components/NewComponent.tsx
"use client";

import { useState, useEffect } from "react";

type NewComponentProps = {
  walletAddress: string | null;
};

export function NewComponent({ walletAddress }: NewComponentProps) {
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!walletAddress) return;
    // Fetch data
  }, [walletAddress]);

  return (
    <section className="panel rounded-lg p-5">
      <h2 className="text-lg font-bold">Новый компонент</h2>
      {/* Content */}
    </section>
  );
}
```

### 2. Добавьте на страницу

```tsx
// src/app/page.tsx
import { NewComponent } from "@/components/NewComponent";

// В нужном табе:
{activeTab === "new" && (
  <NewComponent walletAddress={walletAddress} />
)}
```

---

## Добавление нового API endpoint

### 1. Создайте route

```ts
// src/app/api/new-route/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  // Handle GET
  return NextResponse.json({ data: "value" });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  // Handle POST
  return NextResponse.json({ success: true });
}
```

---

## Добавление новой таблицы в Supabase

### 1. Обновите SQL schema

```sql
-- supabase-schema.sql
create table public.new_table (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  data text not null,
  created_at timestamptz not null default now()
);

create index idx_new_table_user on public.new_table(user_id);

alter table public.new_table enable row level security;
create policy "public read new_table" on public.new_table for select using (true);
create policy "public insert new_table" on public.new_table for insert with check (true);
```

### 2. Добавьте функции в supabase.ts

```ts
export async function getNewData(walletAddress: string) {
  const db = getSupabase();
  if (!db) return [];

  return safeQuery(
    async () => {
      const user = await getUser(walletAddress);
      if (!user) return [];
      const { data, error } = await db
        .from("new_table")
        .select("*")
        .eq("user_id", user.id);
      if (error) throw error;
      return data ?? [];
    },
    [],
    "getNewData"
  );
}
```

---

## Добавление нового достижения

### 1. В SQL schema

```sql
insert into public.achievements (slug, title, description, icon, category, requirement_text)
values ('new-achievement', 'Название', 'Описание', '🏆', 'trading', 'Требование');
```

### 2. В Achievements.tsx (fallback)

```ts
const FALLBACK_ACHIEVEMENTS: Achievement[] = [
  // ... существующие
  { id: "13", slug: "new-achievement", title: "Название", description: "Описание", icon: "🏆", category: "trading", requirement_text: "Требование" },
];
```

### 3. В supabase.ts (проверка)

```ts
export async function checkAndUnlockAchievements(walletAddress: string) {
  // ... существующие проверки
  if (условие_достижения) {
    if (await unlockAchievement(walletAddress, "new-achievement"))
      unlocked.push("new-achievement");
  }
}
```

---

## Добавление нового типа ордера

### 1. В types.ts

```ts
export type OrderType = "market" | "limit" | "stop-loss" | "take-profit" | "new-type";
```

### 2. В SQL schema

```sql
alter table public.trades add column order_type text check (order_type in ('market', 'limit', 'stop-loss', 'take-profit', 'new-type'));
```

### 3. В Simulator.tsx

- Добавить в `ORDER_TYPES` массив
- Добавить логику в `checkAutoClose`
- Добавить UI для нового типа

### 4. В supabase.ts

- Обновить `saveTrade` для нового поля

---

## Стилизация

### Цвета (tailwind.config.ts)

| Цвет | HEX | Использование |
|------|-----|---------------|
| `ink` | #171717 | Текст, заголовки |
| `paper` | #f7f5ef | Фон |
| `mint` | #88d4ab | Позитивные элементы |
| `coral` | #f36f5f | Негативные элементы |
| `steel` | #49627a | Нейтральные элементы |

### Классы

```css
.panel          /* Карточка с тенью */
.rounded-lg     /* Скруглённые углы */
.border-ink/10  /* Тонкая рамка */
.bg-white/72    /* Полупрозрачный фон */
```

---

## Тестирование

### Ручное тестирование

1. Подключите Phantom кошелёк на Devnet
2. Получите тестовые SOL
3. Откройте сделку (Buy/Sell)
4. Закройте сделку
5. Проверьте P&L
6. Проверьте достижения

### Проверка Supabase

1. Откройте Supabase Dashboard
2. Перейдите в Table Editor
3. Проверьте таблицы `users`, `trades`, `user_achievements`

---

## Деплой

### Preview деплой

```bash
vercel
```

### Production деплой

```bash
vercel --prod
```

### Проверка после деплоя

1. Откройте URL Vercel
2. Подключите Phantom
3. Откройте сделку
4. Проверьте Supabase Dashboard — данные должны сохраниться
