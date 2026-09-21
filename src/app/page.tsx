"use client";

import { useState, useCallback } from "react";
import {
  BookOpen,
  BarChart3,
  Trophy,
  GraduationCap,
  Wallet,
  Database,
  ShieldCheck,
} from "lucide-react";
import { LessonList } from "@/components/LessonList";
import { MentorPanel } from "@/components/MentorPanel";
import { Simulator } from "@/components/Simulator";
import { WalletConnect } from "@/components/WalletConnect";
import { Achievements } from "@/components/Achievements";
import { UserStats } from "@/components/UserStats";
import { Portfolio } from "@/components/Portfolio";
import { Analytics } from "@/components/Analytics";
import { ToastProvider } from "@/components/Toast";
import type { MentorFeedback, ClosedPosition } from "@/lib/types";
import { isSupabaseConfigured } from "@/lib/supabase";

type Tab = "learn" | "trade" | "achievements";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "learn", label: "Обучение", icon: <BookOpen size={18} /> },
  { id: "trade", label: "Торговля", icon: <BarChart3 size={18} /> },
  { id: "achievements", label: "Достижения", icon: <Trophy size={18} /> },
];

function Home() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<MentorFeedback[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("learn");
  const [closedPositions, setClosedPositions] = useState<ClosedPosition[]>([]);
  const [currentPnl, setCurrentPnl] = useState(0);
  const [solBalance, setSolBalance] = useState(0);

  const SOL_USD_RATE = 140;
  const totalCapital = solBalance * SOL_USD_RATE;

  const handleClosedPosition = useCallback((pos: ClosedPosition) => {
    setClosedPositions((prev) => [...prev, pos]);
    setCurrentPnl(0);
  }, []);

  const handleFeedback = useCallback((f: MentorFeedback[]) => {
    setFeedback(f);
  }, []);

  const handleBalanceChange = useCallback((bal: number) => {
    setSolBalance(bal);
  }, []);

  return (
    <main className="min-h-screen bg-paper">
      {/* ——— Header ——— */}
      <header className="sticky top-0 z-50 border-b border-ink/10 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink text-white">
              <GraduationCap size={20} />
            </div>
            <div>
              <h1 className="text-lg font-black leading-tight">TradeMind</h1>
              <p className="text-[10px] font-medium uppercase tracking-wider text-ink/40">
                Education
              </p>
            </div>
          </div>
          <WalletConnect
            walletAddress={walletAddress}
            onConnect={setWalletAddress}
            onDisconnect={() => {
              setWalletAddress(null);
              setClosedPositions([]);
              setSolBalance(0);
            }}
          />
        </div>
      </header>

      {/* ——— Tab bar ——— */}
      <div className="border-b border-ink/10 bg-white/50">
        <div className="mx-auto flex max-w-7xl gap-1 px-4 sm:px-6 lg:px-8">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition ${
                activeTab === tab.id
                  ? "border-ink text-ink"
                  : "border-transparent text-ink/45 hover:text-ink/70"
              }`}
              type="button"
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ——— Content ——— */}
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        {/* Status badges */}
        <div className="mb-5 flex flex-wrap gap-2">
          <Badge
            icon={<Wallet size={13} />}
            text="Phantom"
            ok={!!walletAddress}
          />
          <Badge
            icon={<Database size={13} />}
            text="Supabase"
            ok={isSupabaseConfigured}
          />
          <Badge
            icon={<ShieldCheck size={13} />}
            text="Devnet"
            ok={true}
          />
        </div>

        {/* ——— TAB: Обучение ——— */}
        {activeTab === "learn" && (
          <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
            <LessonList />
            <div className="space-y-5">
              <UserStats walletAddress={walletAddress} />
              <MentorPanel feedback={feedback} />
            </div>
          </div>
        )}

        {/* ——— TAB: Торговля ——— */}
        {activeTab === "trade" && (
          <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
            <div className="space-y-5">
              <Simulator
                onFeedback={handleFeedback}
                onClosedPosition={handleClosedPosition}
                walletAddress={walletAddress}
                onBalanceChange={handleBalanceChange}
              />
              <Portfolio
                closedPositions={closedPositions}
                currentPnl={currentPnl}
                totalCapital={totalCapital}
              />
            </div>
            <div className="space-y-5">
              <UserStats walletAddress={walletAddress} />
              <Analytics closedPositions={closedPositions} />
              <MentorPanel feedback={feedback} />
            </div>
          </div>
        )}

        {/* ——— TAB: Достижения ——— */}
        {activeTab === "achievements" && (
          <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
            <Achievements walletAddress={walletAddress} />
            <div className="space-y-5">
              <UserStats walletAddress={walletAddress} />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default function HomeWithToast() {
  return (
    <ToastProvider>
      <Home />
    </ToastProvider>
  );
}

/* ------------------------------------------------------------------ */
/*  Small components                                                   */
/* ------------------------------------------------------------------ */

function Badge({
  icon,
  text,
  ok,
}: {
  icon: React.ReactNode;
  text: string;
  ok: boolean;
}) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
        ok ? "bg-mint/15 text-steel" : "bg-ink/5 text-ink/40"
      }`}
    >
      {icon}
      {text}
      {ok ? (
        <span className="h-1.5 w-1.5 rounded-full bg-mint" />
      ) : (
        <span className="h-1.5 w-1.5 rounded-full bg-ink/20" />
      )}
    </div>
  );
}
