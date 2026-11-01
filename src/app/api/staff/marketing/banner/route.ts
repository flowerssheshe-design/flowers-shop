import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/staff/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY = "announcement_banner_text";

function unwrap(v: unknown): string {
  if (v && typeof v === "object" && "value" in (v as Record<string, unknown>)) {
    return unwrap((v as Record<string, unknown>).value);
  }
  return typeof v === "string" ? v : "";
}

export async function GET() {
  const guard = await requireStaff("marketing_push");
  if (!guard.ok) return guard.response;
  const admin = createAdminClient();
  const { data, error } = await admin.from("system_settings").select("value").eq("key", KEY).maybeSingle();
  if (error) {
    console.error("banner get error:", error);
    return NextResponse.json({ error: "הטעינה נכשלה. נסו לרענן." }, { status: 500 });
  }
  return NextResponse.json({ text: unwrap((data as { value?: unknown } | null)?.value) });
}

const Body = z.object({ text: z.string().max(200, "ההודעה ארוכה מדי (עד 200 תווים)") });

/** Empty text hides the banner. */
export async function PUT(req: Request) {
  const guard = await requireStaff("marketing_push");
  if (!guard.ok) return guard.response;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "נתונים לא תקינים" }, { status: 400 });
  }
  const text = parsed.data.text.replace(/\s+/g, " ").trim();
  const admin = createAdminClient();
  const { error } = await admin
    .from("system_settings")
    .upsert({ key: KEY, value: text, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) {
    console.error("banner save error:", error);
    return NextResponse.json({ error: "השמירה נכשלה. נסו שוב." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, text });
}
