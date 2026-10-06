"use client";

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { SystemSettings, DEFAULTS } from "@/lib/useSystemSettings.types";

interface SystemSettingsContextType {
  settings: SystemSettings;
  refresh: () => Promise<void>;
}

export const SystemSettingsContext = createContext<SystemSettingsContextType | undefined>(undefined);

export const SETTINGS_UPDATED_EVENT = "system-settings:updated";
export const SETTINGS_REFRESH_STORAGE_KEY = "system-settings:refresh";

export function broadcastSystemSettingsUpdate() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SETTINGS_UPDATED_EVENT));
  localStorage.setItem(SETTINGS_REFRESH_STORAGE_KEY, Date.now().toString());
}

export function SystemSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SystemSettings>(DEFAULTS);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/settings", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data?.settings) {
          const s = data.settings as Record<string, unknown>;
          setSettings({
            delivery_fee: readValue(s.delivery_fee, DEFAULTS.delivery_fee),
            club_discount_threshold: readValue(s.club_discount_threshold, DEFAULTS.club_discount_threshold),
            member_discount_percent: readValue(s.member_discount_percent, DEFAULTS.member_discount_percent),
            bit_number: readValue(s.bit_number, DEFAULTS.bit_number),
            paybox_number: readValue(s.paybox_number, DEFAULTS.paybox_number),
            whatsapp_number: readValue(s.whatsapp_number, DEFAULTS.whatsapp_number),
            business_phone: readValue(s.business_phone, DEFAULTS.business_phone),
            contact_phone: readValue(s.contact_phone, DEFAULTS.contact_phone),
            business_email: readValue(s.business_email, DEFAULTS.business_email),
            pickup_address: readValue(s.pickup_address, DEFAULTS.pickup_address),
            pickup_instructions: readValue(s.pickup_instructions, DEFAULTS.pickup_instructions),
            pickup_hours: readValue(s.pickup_hours, DEFAULTS.pickup_hours),
            business_hours: readValue(s.business_hours, DEFAULTS.business_hours),
            preorder_deadline: readValue(s.preorder_deadline, DEFAULTS.preorder_deadline),
            same_day_deadline: readValue(s.same_day_deadline, DEFAULTS.same_day_deadline),
            announcement_banner_text: readValue(s.announcement_banner_text, DEFAULTS.announcement_banner_text),
            is_stall_open: readBool(s.is_stall_open, DEFAULTS.is_stall_open),
          });
        }
      }
    } catch {
      /* keep defaults */
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    await fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    function handleCustomEvent() {
      refresh();
    }

    function handleStorageEvent(e: StorageEvent) {
      if (e.key === SETTINGS_REFRESH_STORAGE_KEY && e.newValue) {
        refresh();
      }
    }

    window.addEventListener(SETTINGS_UPDATED_EVENT, handleCustomEvent);
    window.addEventListener("storage", handleStorageEvent);

    return () => {
      window.removeEventListener(SETTINGS_UPDATED_EVENT, handleCustomEvent);
      window.removeEventListener("storage", handleStorageEvent);
    };
  }, [refresh]);

  return (
    <SystemSettingsContext.Provider value={{ settings, refresh }}>
      {children}
    </SystemSettingsContext.Provider>
  );
}

export function useSystemSettingsContext() {
  const context = useContext(SystemSettingsContext);
  if (!context) {
    return undefined;
  }
  return context;
}

function readValue<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "object" && value !== null && "value" in (value as any)) {
    return readValue((value as any).value, fallback);
  }
  return (value as T) ?? fallback;
}

function readBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return fallback;
}