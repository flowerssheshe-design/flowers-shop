"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export type StoreMode = "preorder" | "realtime";

interface StoreModeContextType {
  mode: StoreMode;
  setMode: (mode: StoreMode) => Promise<void>;
  isLoading: boolean;
  isStallOpen: boolean;
  setStallOpen: (open: boolean) => Promise<void>;
}

const StoreModeContext = createContext<StoreModeContextType | undefined>(undefined);

const STORE_MODE_KEY = "store-mode";
const STALL_OPEN_KEY = "stall-open";
const SYNC_KEY = "store-mode-sync";
const STALL_SYNC_KEY = "stall-open-sync";

export function StoreModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<StoreMode>("preorder");
  const [isStallOpen, setStallOpenState] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadMode = async () => {
    try {
      const res = await fetch("/api/admin/store-mode", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.mode === "preorder" || data.mode === "realtime") {
          setModeState(data.mode);
          localStorage.setItem(STORE_MODE_KEY, data.mode);
        } else {
          console.warn("[StoreModeContext] Invalid mode from API:", data.mode);
        }
        if (typeof data.stall_open === "boolean") {
          setStallOpenState(data.stall_open);
          localStorage.setItem(STALL_OPEN_KEY, String(data.stall_open));
        }
      } else {
        console.error("[StoreModeContext] Failed to fetch store mode:", res.status, await res.text());
      }
    } catch (e) {
      console.error("[StoreModeContext] Failed to load store mode:", e);
      const stored = localStorage.getItem(STORE_MODE_KEY);
      if (stored === "preorder" || stored === "realtime") {
        setModeState(stored);
      }
      const storedStall = localStorage.getItem(STALL_OPEN_KEY);
      if (storedStall !== null) {
        setStallOpenState(storedStall === "true");
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMode();
  }, []);

  useEffect(() => {
    function handleStorage(e: StorageEvent) {
      if (e.key === SYNC_KEY && e.newValue) {
        loadMode();
      }
      if (e.key === STALL_SYNC_KEY && e.newValue) {
        loadMode();
      }
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const setMode = async (newMode: StoreMode) => {
    const previousMode = mode;
    setModeState(newMode);
    localStorage.setItem(STORE_MODE_KEY, newMode);

    try {
      const res = await fetch("/api/admin/store-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: newMode }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.mode === "preorder" || data.mode === "realtime") {
          setModeState(data.mode);
          localStorage.setItem(STORE_MODE_KEY, data.mode);
          localStorage.setItem(SYNC_KEY, Date.now().toString());
        } else {
          console.warn("[StoreModeContext] Invalid mode from API response:", data.mode);
          setModeState(previousMode);
          localStorage.setItem(STORE_MODE_KEY, previousMode);
        }
      } else {
        const errText = await res.text();
        console.error("[StoreModeContext] Failed to set store mode:", res.status, errText);
        setModeState(previousMode);
        localStorage.setItem(STORE_MODE_KEY, previousMode);
      }
    } catch (e) {
      console.error("[StoreModeContext] Exception setting store mode:", e);
      setModeState(previousMode);
      localStorage.setItem(STORE_MODE_KEY, previousMode);
    }
  };

  const setStallOpen = async (open: boolean) => {
    const previousStallOpen = isStallOpen;
    setStallOpenState(open);
    localStorage.setItem(STALL_OPEN_KEY, String(open));

    try {
      const res = await fetch("/api/admin/store-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stall_open: open }),
      });
      if (res.ok) {
        const data = await res.json();
        if (typeof data.stall_open === "boolean") {
          setStallOpenState(data.stall_open);
          localStorage.setItem(STALL_OPEN_KEY, String(data.stall_open));
          localStorage.setItem(STALL_SYNC_KEY, Date.now().toString());
        }
      } else {
        const errText = await res.text();
        console.error("[StoreModeContext] Failed to set stall open:", res.status, errText);
        setStallOpenState(previousStallOpen);
        localStorage.setItem(STALL_OPEN_KEY, String(previousStallOpen));
      }
    } catch (e) {
      console.error("[StoreModeContext] Exception setting stall open:", e);
      setStallOpenState(previousStallOpen);
      localStorage.setItem(STALL_OPEN_KEY, String(previousStallOpen));
    }
  };

  return (
    <StoreModeContext.Provider value={{ mode, setMode, isLoading, isStallOpen, setStallOpen }}>
      {children}
    </StoreModeContext.Provider>
  );
}

export function useStoreMode() {
  const context = useContext(StoreModeContext);
  if (!context) {
    throw new Error("useStoreMode must be used within a StoreModeProvider");
  }
  return context;
}

export function getStoreModeLabel(mode: StoreMode): string {
  return mode === "preorder" ? "הזמנה מראש" : "מכירה חיה בדוכן";
}

export function getStoreModeDescription(mode: StoreMode): string {
  return mode === "preorder"
    ? "הזמנות נרשמות להזמנת ספק — לא יורדות מהמלאי הפיזי"
    : "הזמנות הן מכירות מיידיות — יורדות מהמלאי הפיזי בזמן אמת";
}

export function getStoreModeBadgeClass(mode: StoreMode): string {
  return mode === "preorder"
    ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
    : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
}

export function getStoreModeIcon(mode: StoreMode) {
  return mode === "preorder" ? "📦" : "🏪";
}