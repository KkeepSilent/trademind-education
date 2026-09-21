# ============================================
# TradeMind — Быстрый airdrop на localhost
# ============================================
# Используй после запуска start-local.ps1

param(
    [string]$Wallet = "DcsW1hiunJC4SW897Dje542L19aJMAFpMVv1KA51gTw9",
    [int]$Amount = 1000
)

Write-Host "💰 Airdrop $Amount SOL на $Wallet" -ForegroundColor Cyan

solana config set --url localhost

# Faucet на localhost безлимитный
$chunks = [math]::Ceiling($Amount / 100)
$perChunk = [math]::Min(100, $Amount)

for ($i = 1; $i -le $chunks; $i++) {
    $currentAmount = [math]::Min($perChunk, $Amount - (($i - 1) * $perChunk))
    Write-Host "   [$i/$chunks] +$currentAmount SOL..." -ForegroundColor Gray
    solana airdrop $currentAmount $Wallet --url localhost
    Start-Sleep -Milliseconds 200
}

$balance = solana balance $Wallet --url localhost
Write-Host ""
Write-Host "✅ Баланс: $balance" -ForegroundColor Green
