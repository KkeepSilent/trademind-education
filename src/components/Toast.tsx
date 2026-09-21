"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { X, CheckCircle2, AlertTriangle, Info } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ToastType = "success" | "error" | "info" | "achievement";

type Toast = {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
};

type ToastContextValue = {
  addToast: (toast: Omit<Toast, "id">) => void;
};

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, "id">) => {
    const id = crypto.randomUUID();
    const duration = toast.duration ?? 4000;
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}

      {/* Toast container */}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/*  Toast item                                                         */
/* ------------------------------------------------------------------ */

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 size={18} className="text-mint" />,
  error: <AlertTriangle size={18} className="text-coral" />,
  info: <Info size={18} className="text-steel" />,
  achievement: <span className="text-lg">🏆</span>,
};

const BORDERS: Record<ToastType, string> = {
  success: "border-mint/30",
  error: "border-coral/30",
  info: "border-steel/20",
  achievement: "border-amber-300/50",
};

const BACKGROUNDS: Record<ToastType, string> = {
  success: "bg-mint/10",
  error: "bg-coral/10",
  info: "bg-steel/5",
  achievement: "bg-amber-50",
};

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  return (
    <div
      className={`flex items-start gap-3 rounded-lg border ${BORDERS[toast.type]} ${BACKGROUNDS[toast.type]} bg-white px-4 py-3 shadow-lg backdrop-blur-sm transition-all animate-in slide-in-from-right`}
      style={{ minWidth: 280, maxWidth: 400 }}
    >
      <div className="mt-0.5 shrink-0">{ICONS[toast.type]}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{toast.title}</p>
        {toast.message && (
          <p className="mt-0.5 text-xs text-ink/60">{toast.message}</p>
        )}
      </div>
      <button
        onClick={onClose}
        className="shrink-0 text-ink/30 transition hover:text-ink/60"
        type="button"
      >
        <X size={14} />
      </button>
    </div>
  );
}
