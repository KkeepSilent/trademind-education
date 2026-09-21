import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TradeMind MVP",
  description: "Free-first MVP for learning trading with a rule-based mentor"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <head>
        <script src="/solana-web3.min.js" />
      </head>
      <body>{children}</body>
    </html>
  );
}
