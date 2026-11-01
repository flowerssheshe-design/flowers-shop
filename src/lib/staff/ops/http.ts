import "server-only";
import { NextResponse } from "next/server";
import type { ZodSchema } from "zod";
import { SUPABASE_CONFIGURED } from "@/lib/constants";

// Small response helpers shared by the operations API routes.

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export function notConfigured() {
  return SUPABASE_CONFIGURED ? null : jsonError("המערכת אינה מוגדרת", 503);
}

export function serverError(e: unknown, where: string) {
  console.error(`[staff ops] ${where}:`, e);
  return jsonError("שגיאת שרת. נסו שוב בעוד רגע.", 500);
}

export async function parseBody<T>(
  req: Request,
  schema: ZodSchema<T>,
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message;
    const msg = first && /[֐-׿]/.test(first) ? first : "הנתונים שנשלחו לא תקינים";
    return { ok: false, response: jsonError(msg, 400) };
  }
  return { ok: true, data: parsed.data };
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
