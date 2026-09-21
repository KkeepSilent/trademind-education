# ============================================
# TradeMind — Настройка для локальной разработки
# ============================================

param(
    [string]$AdminWallet = ""
)

Write-Host "⚙️ Настройка TradeMind для локальной разработки" -ForegroundColor Cyan

# Если адрес не передан, генерируем новый
if (-not $AdminWallet) {
    $keyPath = "$env:TEMP\solana-admin-keypair.json"
    if (-not (Test-Path $keyPath)) {
        solana-keygen new --no-bip39-passphrase -o $keyPath --force
    }
    $AdminWallet = solana-keygen pubkey $keyPath
}

Write-Host "📝 Админ-кошелёк: $AdminWallet" -ForegroundColor Yellow

# Обновляем .env.local
$envContent = @"
# ===========================================
# TradeMind Education — Environment Variables
# ===========================================

# Supabase (Settings → API in Supabase Dashboard)
NEXT_PUBLIC_SUPABASE_URL=https://adsntljyujjcwsjltuwy.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_sQvxZ46vs1wfO8ElrlsXCA_3V0-0sCn

# Solana RPC (localhost для разработки, devnet для продакшена)
NEXT_PUBLIC_SOLANA_RPC_URL=http://localhost:8899

# Admin wallet for trading
NEXT_PUBLIC_ADMIN_WALLET=$AdminWallet
"@

Set-Content -Path ".env.local" -Value $envContent -Encoding UTF8

Write-Host ""
Write-Host "✅ .env.local обновлён!" -ForegroundColor Green
Write-Host ""
Write-Host "Следующие шаги:" -ForegroundColor Yellow
Write-Host "  1. Запусти валидатор: .\scripts\start-local.ps1" -ForegroundColor White
Write-Host "  2. Пополни баланс: .\scripts\airdrop.ps1" -ForegroundColor White
Write-Host "  3. Запусти приложение: npm run dev" -ForegroundColor White
