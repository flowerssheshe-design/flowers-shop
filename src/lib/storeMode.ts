import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED } from "@/lib/constants";

export type StoreMode = "preorder" | "realtime";

export async function getStoreMode(): Promise<StoreMode> {
  if (!SUPABASE_CONFIGURED) {
    console.warn("[getStoreMode] Supabase not configured, defaulting to preorder");
    return "preorder";
  }
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("store_settings")
      .select("value")
      .eq("key", "mode")
      .single();

    if (error) {
      console.error("[getStoreMode] Database error:", error);
      return "preorder";
    }

    if (!data) {
      console.warn("[getStoreMode] No store mode row found, defaulting to preorder");
      return "preorder";
    }

    const mode = data.value as string;
    const validMode = mode === "realtime" ? "realtime" : "preorder";
    return validMode;
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