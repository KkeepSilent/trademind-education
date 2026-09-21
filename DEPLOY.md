# Deploy TradeMind Education to Vercel

## Quick Start

### 1. Install Vercel CLI
```bash
npm i -g vercel
```

### 2. Login to Vercel
```bash
vercel login
```

### 3. Link Project
```bash
cd intelligent-trading-education-mvp
vercel link
```

### 4. Set Environment Variables
```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Or set them in Vercel Dashboard → Settings → Environment Variables.

### 5. Deploy
```bash
# Deploy to preview
vercel

# Deploy to production
vercel --prod
```

## Supabase Setup

1. Go to [supabase.com](https://supabase.com) → New Project
2. Copy your project URL and anon key from Settings → API
3. Run the SQL schema in SQL Editor:
   - Go to SQL Editor in Supabase Dashboard
   - Paste contents of `supabase-schema.sql`
   - Click "Run"

## Environment Variables

| Variable | Where to find |
|----------|---------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon/public key |

## Phantom Wallet

Phantom works automatically on the client side. No server configuration needed.

The app uses `window.solana` which is injected by the Phantom browser extension.

## Custom Domain (Optional)

1. Go to Vercel Dashboard → your project → Settings → Domains
2. Add your custom domain
3. Update DNS records as instructed by Vercel

## Notes

- Region `fra1` (Frankfurt) is set in `vercel.json` — change if your users are elsewhere
- The app is fully static + API routes, so it deploys in seconds
- Supabase RLS policies protect user data
