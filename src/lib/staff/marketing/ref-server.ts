import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "./tracking";

type Admin = ReturnType<typeof createAdminClient>;

/** The tracking link id when `raw` is the id of an active link, else null. Never throws. */
export async function resolveActiveLinkId(admin: Admin, raw: string | null | undefined): Promise<string | null> {
  if (!isUuid(raw)) return null;
  try {
    const { data, error } = await admin
      .from("tracking_links")
      .select("id, is_active")
      .eq("id", raw.trim().toLowerCase())
      .maybeSingle();
    const row = data as { id: string; is_active: boolean } | null;
    if (error || !row || !row.is_active) return null;
    return row.id;
  } catch {
    return null;
  }
}

/** Reads a cookie value from a raw Cookie header. */
export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) {
      try {
        return decodeURIComponent(v.join("="));
      } catch {
        return null;
      }
    }
  }
  return null;
}
