"use client";

import { useEffect, useState } from "react";

export type SystemSettings = {
  delivery_fee?: number;
  club_discount_threshold?: number;
  member_discount_percent?: number;
  bit_number?: string;
  paybox_number?: string;
  whatsapp_number?: string;
  contact_phone?: string;
  pickup_address?: string;
  pickup_instructions?: string;
  pickup_hours?: string;
  business_hours?: string;
};

const DEFAULTS: SystemSettings = {
  delivery_fee: 15,
  club_discount_threshold: 3,
  member_discount_percent: 10,
  bit_number: "",
  paybox_number: "",
  whatsapp_number: "972500000000",
  contact_phone: "05-32455705",
  pickup_address: "רחוב צין 37,ירוחם(ליד סופר פינתי)",
  pickup_instructions: "",
  pickup_hours: "10:00-15:00",
  business_hours: "ראשון-ภายใน 08:00-18:00, שישי 09:00-14:00",
};

function readValue<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "object" && value !== null && "value" in (value as any)) {
    return readValue((value as any).value, fallback);
  }
  return (value as T) ?? fallback;
}

/**
 * Fetch system settings from the public admin endpoint and merge with defaults.
 * Safe to call from any client component — never throws.
 */
export function useSystemSettings(): SystemSettings {
  const [settings, setSettings] = useState<SystemSettings>(DEFAULTS);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/settings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.settings) return;
        const s = data.settings as Record<string, unknown>;
        setSettings({
          delivery_fee: readValue(s.delivery_fee, DEFAULTS.delivery_fee),
          club_discount_threshold: readValue(
            s.club_discount_threshold,
            DEFAULTS.club_discount_threshold,
          ),
          member_discount_percent: readValue(
            s.member_discount_percent,
            DEFAULTS.member_discount_percent,
          ),
          bit_number: readValue(s.bit_number, DEFAULTS.bit_number),
          paybox_number: readValue(s.paybox_number, DEFAULTS.paybox_number),
          whatsapp_number: readValue(s.whatsapp_number, DEFAULTS.whatsapp_number),
          contact_phone: readValue(s.contact_phone, DEFAULTS.contact_phone),
          pickup_address: readValue(s.pickup_address, DEFAULTS.pickup_address),
          pickup_instructions: readValue(
            s.pickup_instructions,
            DEFAULTS.pickup_instructions,
          ),
          pickup_hours: readValue(s.pickup_hours, DEFAULTS.pickup_hours),
          business_hours: readValue(s.business_hours, DEFAULTS.business_hours),
        });
      })
      .catch(() => {
        /* keep defaults */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return settings;
}