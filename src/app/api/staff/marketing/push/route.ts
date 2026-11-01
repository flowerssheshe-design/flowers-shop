import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/staff/guard";
import { isMissingSchema } from "@/lib/staff/marketing/data";
import { ML } from "@/lib/staff/marketing/labels";
import { countSubscribers, pushConfigured, sendPushToAll } from "@/lib/staff/marketing/push";
import { safeRedirectPath } from "@/lib/staff/marketing/tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const guard = await requireStaff("marketing_push");
  if (!guard.ok) return guard.response;
  try {
    const admin = createAdminClient();
    const subscribers = await countSubscribers(admin);
    const { data: last } = await admin
      .from("message_log")
      .select("created_at")
      .eq("channel", "push")
      .eq("status", "sent")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return NextResponse.json({
      configured: pushConfigured(),
      subscribers,
      lastSentAt: (last as { created_at: string } | null)?.created_at ?? null,
    });
  } catch (e) {
    if (isMissingSchema(e)) {
      return NextResponse.json({ error: "טבלת המנויים עוד לא קיימת (צריך להריץ את מיגרציה 031)." }, { status: 503 });
    }
    console.error("push status error:", e);
    return NextResponse.json({ error: "הטעינה נכשלה. נסו לרענן." }, { status: 500 });
  }
}

const Body = z.object({
  title: z.string().trim().min(2, "כותרת קצרה מדי").max(60, "כותרת ארוכה מדי (עד 60 תווים)"),
  body: z.string().trim().min(2, "טקסט קצר מדי").max(180, "טקסט ארוך מדי (עד 180 תווים)"),
  url: z.string().trim().max(300).optional().default("/"),
  confirm: z.literal(true, { errorMap: () => ({ message: "צריך לאשר את השליחה" }) }),
});

export async function POST(req: Request) {
  const guard = await requireStaff("marketing_push");
  if (!guard.ok) return guard.response;
  if (!pushConfigured()) return NextResponse.json({ error: ML.pushNotConfiguredError }, { status: 503 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "נתונים לא תקינים" }, { status: 400 });
  }
  const url = safeRedirectPath(parsed.data.url || "/");
  if (!url) {
    return NextResponse.json({ error: "הקישור צריך להיות דף באתר שמתחיל ב-/ (למשל /catalog)." }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const result = await sendPushToAll(admin, { title: parsed.data.title, body: parsed.data.body, url });
    return NextResponse.json(result);
  } catch (e) {
    console.error("push send error:", e);
    return NextResponse.json({ error: "השליחה נכשלה. נסו שוב." }, { status: 500 });
  }
}
