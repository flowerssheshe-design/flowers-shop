"use client";

import { useContext, useEffect, useState } from "react";
import { SystemSettings, DEFAULTS } from "@/lib/useSystemSettings.types";
import {
  SystemSettingsContext,
  SETTINGS_UPDATED_EVENT,
  SETTINGS_REFRESH_STORAGE_KEY,
  broadcastSystemSettingsUpdate,
} from "@/context/SystemSettingsContext";

export { SETTINGS_UPDATED_EVENT, broadcastSystemSettingsUpdate };

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

function applySettings(data: unknown): SystemSettings {
  const s = (data && typeof data === "object" && "settings" in (data as any)
    ? (data as any).settings
    : data) as Record<string, unknown>;
  return {
    delivery_fee: readValue(s?.delivery_fee, DEFAULTS.delivery_fee),
    club_discount_threshold: readValue(
      s?.club_discount_threshold,
      DEFAULTS.club_discount_threshold,
    ),
    member_discount_percent: readValue(
      s?.member_discount_percent,
      DEFAULTS.member_discount_percent,
    ),
    bit_number: readValue(s?.bit_number, DEFAULTS.bit_number),
    paybox_number: readValue(s?.paybox_number, DEFAULTS.paybox_number),
    whatsapp_number: readValue(s?.whatsapp_number, DEFAULTS.whatsapp_number),
    business_phone: readValue(s?.business_phone, DEFAULTS.business_phone),
    contact_phone: readValue(s?.contact_phone, DEFAULTS.contact_phone),
    business_email: readValue(s?.business_email, DEFAULTS.business_email),
    pickup_address: readValue(s?.pickup_address, DEFAULTS.pickup_address),
    pickup_instructions: readValue(
      s?.pickup_instructions,
      DEFAULTS.pickup_instructions,
    ),
    pickup_hours: readValue(s?.pickup_hours, DEFAULTS.pickup_hours),
    business_hours: readValue(s?.business_hours, DEFAULTS.business_hours),
    preorder_deadline: readValue(
      s?.preorder_deadline,
      DEFAULTS.preorder_deadline,
    ),
    same_day_deadline: readValue(
      s?.same_day_deadline,
      DEFAULTS.same_day_deadline,
    ),
    announcement_banner_text: readValue(
      s?.announcement_banner_text,
      DEFAULTS.announcement_banner_text,
    ),
    is_stall_open: readBool(s?.is_stall_open, DEFAULTS.is_stall_open),
  };
}

/**
 * Read system settings.
 * When SystemSettingsProvider is present (the normal case, wired in the root
 * layout), the provider's settings are returned directly so every consumer
 * re-renders synchronously when settings change site-wide. When no provider
 * is present, falls back to a self-fetch of /api/admin/settings and listens
 * for the settings broadcast + cross-tab storage events. Never throws.
 */
export function useSystemSettings(): SystemSettings {
  const context = useContext(SystemSettingsContext);
  const [settings, setSettings] = useState<SystemSettings>(DEFAULTS);

  // Fallback (no provider): self-fetch + live-update listeners.
  useEffect(() => {
    if (context) return;
    let cancelled = false;

    const load = () => {
      fetch("/api/admin/settings", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (cancelled || !data?.settings) return;
          setSettings(applySettings(data));
        })
        .catch(() => {
          /* keep defaults */
        });
    };

    function handleCustomEvent() {
      load();
    }

    function handleStorageEvent(e: StorageEvent) {
      if (e.key === SETTINGS_REFRESH_STORAGE_KEY && e.newValue) {
        load();
      }
    }

    load();
    window.addEventListener(SETTINGS_UPDATED_EVENT, handleCustomEvent);
    window.addEventListener("storage", handleStorageEvent);
    return () => {
      cancelled = true;
      window.removeEventListener(SETTINGS_UPDATED_EVENT, handleCustomEvent);
      window.removeEventListener("storage", handleStorageEvent);
    };
  }, [context]);

  // Provider mode: return the provider's settings directly (always current).
  if (context) {
    return context.settings;
  }
  return settings;
}