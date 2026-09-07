"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";

type ToastTone = "success" | "error" | "info";

type ToastItem = {
  id: number;
  message: string;
  tone: ToastTone;
};

type ToastListener = (item: ToastItem) => void;

const listeners = new Set<ToastListener>();
let nextId = 0;

function publish(message: string, tone: ToastTone) {
  const item: ToastItem = { id: ++nextId, message, tone };
  listeners.forEach((listener) => listener(item));
}

export const toast = {
  success(message: string) {
    publish(message, "success");
  },
  error(message: string) {
    publish(message, "error");
  },
  info(message: string) {
    publish(message, "info");
  },
};

const TONE_CLASS: Record<ToastTone, string> = {
  success: "bg-[#17221f] text-white",
  error: "bg-red-700 text-white",
  info: "bg-[#17221f] text-white",
};

export function ToastViewport() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const listener: ToastListener = (item) => {
      setItems((current) => [...current, item].slice(-4));
      window.setTimeout(() => {
        setItems((current) => current.filter((t) => t.id !== item.id));
      }, 3200);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-5 z-[100] flex flex-col items-center gap-2 px-4"
      aria-live="polite"
    >
      {items.map((item) => (
        <div
          key={item.id}
          className={`pointer-events-auto flex max-w-md items-start gap-2 rounded-xl px-4 py-3 text-xs font-medium shadow-2xl ${TONE_CLASS[item.tone]}`}
          role={item.tone === "error" ? "alert" : "status"}
        >
          {item.tone === "success" ? (
            <Check className="mt-0.5 size-4 shrink-0 text-[#a594f5]" />
          ) : item.tone === "error" ? (
            <X className="mt-0.5 size-4 shrink-0 text-white/80" />
          ) : null}
          <span className="leading-5">{item.message}</span>
        </div>
      ))}
    </div>
  );
}
