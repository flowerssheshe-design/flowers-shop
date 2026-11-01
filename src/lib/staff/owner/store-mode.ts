// Pure store-mode helpers (no server imports, safe for tests and the client).
//
// store_settings.mode holds the owner's choice:
//   'auto'     – follow the business-week phase (default)
//   'preorder' – force pre-orders
//   'realtime' – force live sale
// A missing or unknown value counts as 'auto'.

import type { WeekPhase } from "@/lib/staff/week";

export type StoreMode = "preorder" | "realtime";
export type StoreModeSetting = "auto" | StoreMode;
export type OrderTypeForSite = "preorder" | "live";

export const STORE_MODE_SETTINGS: StoreModeSetting[] = ["auto", "preorder", "realtime"];

/** Unwraps jsonb values such as "auto", { value: "auto" } or '"auto"'. */
export function parseStoreModeSetting(raw: unknown): StoreModeSetting {
  let value: unknown = raw;
  if (value && typeof value === "object" && "value" in (value as Record<string, unknown>)) {
    value = (value as Record<string, unknown>).value;
  }
  if (typeof value === "string") {
    const v = value.trim().replace(/^"|"$/g, "");
    if (v === "preorder" || v === "realtime" || v === "auto") return v;
  }
  return "auto";
}

/** The mode the store actually runs in. */
export function resolveStoreMode(setting: StoreModeSetting, phase: WeekPhase): StoreMode {
  if (setting === "preorder" || setting === "realtime") return setting;
  return phase === "live" ? "realtime" : "preorder";
}

/**
 * Website orders are 'live' when the store sells from stock (they deduct
 * inventory), otherwise 'preorder' (they go into the supplier order).
 */
export function orderTypeForMode(mode: StoreMode | string | null | undefined): OrderTypeForSite {
  return mode === "realtime" ? "live" : "preorder";
}
