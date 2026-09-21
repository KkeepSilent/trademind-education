import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        {
          key: "Content-Security-Policy",
          value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://unpkg.com",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob:",
            "connect-src 'self' https://api.devnet.solana.com https://*.supabase.co https://*.supabase.in https://solana-mainnet.g.alchemy.com wss://*.supabase.co",
            "font-src 'self'",
            "frame-src 'none'",
          ].join("; "),
        },
      ],
    },
  ],
};

export default nextConfig;
