import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED } from "@/lib/constants";
import { DEFAULTS, type SystemSettings } from "@/lib/useSystemSettings.types";

export type ServerSettings = Required<SystemSettings>;

/** Unwraps `{ value: x }` wrappers some rows were saved with. */
function unwrap(value: unknown): unknown {
  if (value && typeof value === "object" && "value" in (value as Record<string, unknown>)) {
    return unwrap((value as Record<string, unknown>).value);
  }
  return value;
}

function coerce<T>(raw: unknown, fallback: T): T {
  const value = unwrap(raw);
  if (value === null || value === undefined) return fallback;
  if (typeof fallback === "number") {
    const n = typeof value === "string" ? Number(value.trim()) : Number(value);
    if (typeof value === "string" && value.trim() === "") return fallback;
    return (Number.isFinite(n) ? n : fallback) as T;
  }
  if (typeof fallback === "boolean") {
    if (typeof value === "boolean") return value as T;
    if (value === "true") return true as T;
    if (value === "false") return false as T;
    return fallback;
  }
  if (typeof fallback === "string") {
    return (typeof value === "string" ? value : String(value)) as T;
  }
  return value as T;
}

/** Merges raw `system_settings` key/value rows with DEFAULTS. */
export function mergeSettings(rows: { key: string; value: unknown }[] | null | undefined): ServerSettings {
  const raw: Record<string, unknown> = {};
  for (const row of rows ?? []) raw[row.key] = row.value;
  const out = { ...DEFAULTS } as Record<string, unknown>;
  for (const key of Object.keys(DEFAULTS) as (keyof ServerSettings)[]) {
    out[key] = coerce(raw[key], DEFAULTS[key]);
  }
  return out as ServerSettings;
}

/**
 * Reads system settings on the server (service role). Never throws; falls back
 * to DEFAULTS when Supabase is not configured or the query fails.
 */
export async function getServerSettings(): Promise<ServerSettings> {
  if (!SUPABASE_CONFIGURED) return { ...DEFAULTS };
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("system_settings").select("key, value");
    if (error) {
      console.error("getServerSettings error:", error);
      return { ...DEFAULTS };
    }
    return mergeSettings(data as { key: string; value: unknown }[] | null);
  } catch (e) {
    console.error("getServerSettings exception:", e);
    return { ...DEFAULTS };
  }
}
