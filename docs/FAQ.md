# TradeMind Education — Быстрая справка

## Часто задаваемые вопросы

### Почему Supabase показывает "не подключена"?

Проверьте `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Убедитесь, что:
1. Переменные названы именно так (без опечаток)
2. URL начинается с `https://`
3. Anon key скопирован полностью

### Почему trades не сохраняются?

1. Откройте DevTools → Console
2. Посмотрите ошибки с префиксом `[Supabase]`
3. Убедитесь, что SQL schema выполнен в Supabase

### Почему баланс = 0?

1. Подключите Phantom кошелёк
2. Убедитесь, что Phantom переключён на **Devnet**
3. Получите тестовые SOL через https://faucet.solana.com

### Почему достижения не загружаются?

1. Выполните `supabase-schema.sql` в Supabase SQL Editor
2. Проверьте таблицу `achievements` — там должно быть 12 записей

---

## Полезные ссылки

| Ресурс | URL |
|--------|-----|
| Phantom Wallet | https://phantom.app |
| Solana Devnet Faucet | https://faucet.solana.com |
| Supabase Dashboard | https://supabase.com/dashboard |
| Solana Explorer | https://explorer.solana.com/?cluster=devnet |
| CoinMarketCap | https://coinmarketcap.com |

---

## Типичные ошибки

| Ошибка | Причина | Решение |
|--------|---------|---------|
| `Phantom не найден` | Расширение не установлено | Установите Phantom |
| `Balance fetch failed` | Phantom на>Mainnet | Переключите на Devnet |
| `column "user_id" does not exist` | Старая схема БД | Выполните обновлённый SQL |
| `Failed to save trade` | Нет таблицы `trades` | Выполните SQL schema |
