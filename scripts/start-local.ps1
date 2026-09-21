# ============================================
# TradeMind — Local Devnet (бесконечные SOL)
# ============================================
# Запуск: .\scripts\start-local.ps1
# Остановка: Ctrl+C

Write-Host "🚀 Запуск локального Solana валидатора..." -ForegroundColor Cyan

# Проверяем установлен ли solana-cli
$solanaExists = Get-Command solana -ErrorAction SilentlyContinue
if (-not $solanaExists) {
    Write-Host "❌ Solana CLI не установлен!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Установи:" -ForegroundColor Yellow
    Write-Host "  sh -c 'curl https://release.anza.xyz/stable/install | bash'" -ForegroundColor White
    Write-Host "  или скачай с: https://docs.solanalabs.com/cli/install" -ForegroundColor White
    Write-Host ""
    Write-Host "Альтернатива — используй faucet:" -ForegroundColor Yellow
    Write-Host "  https://faucet.solana.com" -ForegroundColor White
    Write-Host "  Адрес: DcsW1hiunJC4SW897Dje542L19aJMAFpMVv1KA51gTw9" -ForegroundColor White
    exit 1
}

Write-Host "✅ Solana CLI найден" -ForegroundColor Green

# Ключевая пара для валидатора
$validatorKey = "$env:TEMP\solana-validator-key.json"
if (-not (Test-Path $validatorKey)) {
    Write-Host "📝 Генерация ключевой пары валидатора..." -ForegroundColor Yellow
    solana-keygen new --no-bip39-passphrase -o $validatorKey --force
}

# Ключевая пара для админа
$adminKey = "$env:TEMP\solana-admin-keypair.json"
if (-not (Test-Path $adminKey)) {
    Write-Host "📝 Генерация ключевой пары админа..." -ForegroundColor Yellow
    solana-keygen new --no-bip39-passphrase -o $adminKey --force
}

# Получаем адрес админа
$adminAddress = solana-keygen pubkey $adminKey
Write-Host ""
Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  🔑 Админ-кошелёк (локальный)           ║" -ForegroundColor Cyan
Write-Host "║  $adminAddress" -ForegroundColor White
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Конфигурируем Solana CLI на localhost
solana config set --url localhost

Write-Host "🏗️ Запуск валидатора (бесконечные SOL)..." -ForegroundColor Yellow
Write-Host "   Нажми Ctrl+C для остановки" -ForegroundColor Gray
Write-Host ""

# Запускаем валидатор в фоне
$validatorProcess = Start-Process -FilePath "solana-test-validator" -ArgumentList `
    "--reset", `
    "--ledger", "$env:TEMP\solana-test-ledger", `
    "--bind-address", "127.0.0.1", `
    "--port", "8899", `
    "--rpc-port", "8899", `
    "--bpf-jit", `
    "-o", "$validatorKey" `
    -PassThru -NoNewWindow

Write-Host "⏳ Ожидание запуска валидатора (5 сек)..." -ForegroundColor Gray
Start-Sleep -Seconds 5

# Проверяем что валидатор запустился
try {
    $health = Invoke-RestMethod -Uri "http://localhost:8899" -Method Post -Body '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' -ContentType "application/json" -TimeoutSec 3
    if ($health.result -eq "ok") {
        Write-Host "✅ Валидатор запущен!" -ForegroundColor Green
    }
} catch {
    Write-Host "⚠️ Валидатор может ещё запускаться, подожди..." -ForegroundColor Yellow
    Start-Sleep -Seconds 5
}

# Конфигурируем на localhost
solana config set --url localhost

# Делаем airdrop 1000 SOL админу
Write-Host ""
Write-Host "💰 Выдача 1000 SOL админу..." -ForegroundColor Yellow

$chunks = 10
$perChunk = 100
for ($i = 1; $i -le $chunks; $i++) {
    Write-Host "   [$i/$chunks] +$perChunk SOL..." -ForegroundColor Gray
    solana airdrop $perChunk $adminAddress --url localhost 2>$null
    Start-Sleep -Milliseconds 500
}

# Проверяем баланс
$balance = solana balance $adminAddress --url localhost
Write-Host ""
Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  ✅ Баланс админа: $balance" -ForegroundColor Green
Write-Host "║  🌐 RPC: http://localhost:8899" -ForegroundColor White
Write-Host "║  🔗 Explorer: http://localhost:8899" -ForegroundColor White
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "📝 Обнови .env.local:" -ForegroundColor Yellow
Write-Host "   NEXT_PUBLIC_SOLANA_RPC_URL=http://localhost:8899" -ForegroundColor White
Write-Host "   NEXT_PUBLIC_ADMIN_WALLET=$adminAddress" -ForegroundColor White
Write-Host ""
Write-Host "🚀 Теперь запусти: npm run dev" -ForegroundColor Cyan
Write-Host ""
Write-Host "Для остановки валидатора — закрой это окно или нажми Ctrl+C" -ForegroundColor Gray

# Ждём пока валидатор работает
Write-Host ""
Write-Host "⏳ Валидатор работает. Нажми Ctrl+C для остановки." -ForegroundColor Gray
try {
    $validatorProcess.WaitForExit()
} finally {
    Write-Host "🛑 Остановка валидатора..." -ForegroundColor Yellow
    $validatorProcess.Kill()
    Write-Host "✅ Готово" -ForegroundColor Green
}
