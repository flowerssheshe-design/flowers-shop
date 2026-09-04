"use client";

import * as React from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const TOAST_DURATION = 4500;
const EXIT_ANIMATION_MS = 300;

export type ToastVariant = "default" | "success" | "error";

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
}

interface ToastEntry extends ToastOptions {
  id: string;
}

interface ToastApi {
  toast: (options: ToastOptions) => void;
}

const ToastApiContext = React.createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = React.useContext(ToastApiContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastEntry[]>([]);

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback(
    (options: ToastOptions) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      setToasts((prev) => [...prev, { ...options, id }]);
      setTimeout(() => removeToast(id), TOAST_DURATION + EXIT_ANIMATION_MS);
    },
    [removeToast],
  );

  const dismissToast = React.useCallback(
    (id: string) => {
      setTimeout(() => removeToast(id), EXIT_ANIMATION_MS);
    },
    [removeToast],
  );

  const variantClasses: Record<ToastVariant, string> = {
    default: "border-border bg-background text-foreground",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    error: "border-rose-200 bg-rose-50 text-rose-900",
  };

  return (
    <ToastApiContext.Provider value={{ toast }}>
      {children}
      <ToastPrimitive.Provider duration={TOAST_DURATION}>
        <ToastPrimitive.Viewport className="fixed top-4 z-[100] flex flex-col gap-2 p-4 md:top-0 md:right-0 md:bottom-4 md:left-auto md:flex-col-reverse" />
        {toasts.map((t) => (
          <ToastPrimitive.Root
            key={t.id}
            defaultOpen
            onOpenChange={(open) => {
              if (!open) dismissToast(t.id);
            }}
            className={cn(
              "pointer-events-auto relative flex w-full max-w-sm flex-col gap-1 rounded-md border p-3 pr-10 text-sm shadow-lg",
              "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
              variantClasses[t.variant ?? "default"],
            )}
          >
            <ToastPrimitive.Title className="font-medium">
              {t.title}
            </ToastPrimitive.Title>
            {t.description ? (
              <ToastPrimitive.Description className="text-xs opacity-90">
                {t.description}
              </ToastPrimitive.Description>
            ) : null}
            <ToastPrimitive.Close className="absolute end-2 top-2 rounded p-1 opacity-60 hover:opacity-100">
              <X className="h-4 w-4" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
      </ToastPrimitive.Provider>
    </ToastApiContext.Provider>
  );
}
