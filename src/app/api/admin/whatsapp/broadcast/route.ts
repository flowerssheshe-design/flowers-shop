import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED, WHATSAPP_CONFIGURED } from "@/lib/constants";
import { broadcastWhatsApp } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const BodySchema = z.object({
  message: z.string().min(1).max(4096),
  recipients: z.enum(["all", "selected"]),
  userIds: z.array(z.string().uuid()).max(500).optional(),
});

export async function POST(req: Request) {
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json({ error: "המערכת אינה מוגדרת" }, { status: 503 });
  }
  if (!WHATSAPP_CONFIGURED) {
    return NextResponse.json(
      {
        error:
          "שליחת וואצפ אינה מוגדרת. הגדר WHATSAPP_API_TOKEN ו-WHATSAPP_PHONE_ID בסביבת הפיתוח.",
      },
      { status: 503 },
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "בקשה לא תקינה", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { message, recipients, userIds } = parsed.data;

  if (recipients === "selected" && (!userIds || userIds.length === 0)) {
    return NextResponse.json(
      { error: "יש לבחור לפחות משתמש שיקבל את ההודעה" },
      { status: 400 },
    );
  }

  try {
    const admin = createAdminClient();
    let query = admin
      .from("profiles")
      .select("id, full_name, phone, notification_opt_in");

    if (recipients === "selected") {
      query = query.in("id", userIds!);
    }

    const { data, error: qErr } = await query;
    if (qErr) {
      console.error("profiles query error:", qErr);
      return NextResponse.json(
        { error: "שליפת משתמשים נכשלה" },
        { status: 500 },
      );
    }

    const recipientList = (data ?? []).map((p) => ({
      user_id: p.id,
      name: p.full_name ?? null,
      phone: p.phone ?? null,
      opted_in: p.notification_opt_in !== false,
    }));

    let filtered = recipientList;
    if (recipients === "all") {
      filtered = recipientList.filter((r) => Boolean(r.phone));
    }

    if (filtered.length === 0) {
      return NextResponse.json({
        sent: 0,
        failed: 0,
        skipped: 0,
        total: 0,
        results: [],
      });
    }

    const results = await broadcastWhatsApp(filtered, message, {
      concurrency: 5,
    });

    const sent = results.filter((r) => r.status === "sent").length;
    const failed = results.filter((r) => r.status === "failed").length;
    const skipped = results.filter((r) => r.status === "skipped").length;

    return NextResponse.json({
      sent,
      failed,
      skipped,
      total: results.length,
      results,
    });
  } catch (e) {
    console.error("broadcast error:", e);
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}
