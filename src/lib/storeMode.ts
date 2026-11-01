import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED } from "@/lib/constants";
import { getServerSettings } from "@/lib/settings-server";
import { currentBusinessWeek, type BusinessWeek } from "@/lib/staff/week";
import {
  parseStoreModeSetting,
  resolveStoreMode,
  type StoreMode,
  type StoreModeSetting,
} from "@/lib/staff/owner/store-mode";

export type { StoreMode, StoreModeSetting };

export type StoreModeInfo = {
  /** What the owner chose in settings ('auto' unless overridden). */
  setting: StoreModeSetting;
  /** The mode the store runs in right now. */
  mode: StoreMode;
  week: BusinessWeek;
};

async function readModeSetting(): Promise<StoreModeSetting> {
  if (!SUPABASE_CONFIGURED) return "auto";
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("store_settings")
      .select("value")
      .eq("key", "mode")
      .maybeSingle();
    if (error) {
      console.error("[getStoreMode] Database error:", error);
      return "auto";
    }
    return parseStoreModeSetting(data?.value);
  } catch (e) {
    console.error("[getStoreMode] Unexpected exception:", e);
    return "auto";
  }
}

/**
 * Store mode plus the business week it was derived from.
 * 'auto' follows the week phase: before the supplier order → pre-orders,
 * after it → live sale. A manual override in store_settings.mode wins.
 */
export async function getStoreModeInfo(now: Date = new Date()): Promise<StoreModeInfo> {
  const [setting, settings] = await Promise.all([readModeSetting(), getServerSettings()]);
  const week = currentBusinessWeek(settings, now);
  return { setting, mode: resolveStoreMode(setting, week.phase), week };
}

export async function getStoreMode(): Promise<StoreMode> {
  try {
    return (await getStoreModeInfo()).mode;
  } catch (e) {
    console.error("[getStoreMode] Unexpected exception:", e);
    return "preorder";
  }
}

export function isRealtimeMode(mode: StoreMode): boolean {
  return mode === "realtime";
}

export function isPreorderMode(mode: StoreMode): boolean {
  return mode === "preorder";
}
