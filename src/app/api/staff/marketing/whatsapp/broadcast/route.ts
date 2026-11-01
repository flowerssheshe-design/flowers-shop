import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/constants";
import { requireStaff } from "@/lib/staff/guard";
import { isMissingSchema, loadCustomerStats, regularThreshold } from "@/lib/staff/marketing/data";
import { ML } from "@/lib/staff/marketing/labels";
import { SEGMENT_KINDS, inSegment, selectRecipients, type SegmentKind } from "@/lib/staff/marketing/segments";
import { firstName } from "@/lib/staff/marketing/templates";
import {
  loadTemplate,
  sendTemplated,
  whatsappConfigured,
  writeLog,
  type LogRow,
} from "@/lib/staff/marketing/whatsapp-send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_RECIPIENTS = 1000;

const Body = z
  .object({
    segment: z.object({
      kind: z.enum(SEGMENT_KINDS as [SegmentKind, ...SegmentKind[]]),
      weeks: z.number().int().min(1).max(104).optional(),
    }),
    template_id: z.string().uuid().optional().nullable(),
    message: z.string().trim().max(4096).optional().nullable(),
    /** false = only count recipients; true = send. */
    confirm: z.boolean().default(false),
  })
  .refine((b) => !b.confirm || !!b.template_id || !!b.message, "בחרו תבנית או כתבו הודעה");

/**
 * Preview (confirm=false): how many customers would get the message.
 * Send (confirm=true): sends and logs every message. Returns totals only.
 */
export async function POST(req: Request) {
  const guard = await requireStaff("marketing_whatsapp");
  if (!guard.ok) return guard.response;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "נתונים לא תקינים" }, { status: 400 });
  }
  const { segment, template_id, message, confirm } = parsed.data;

  try {
    const admin = createAdminClient();
    const now = new Date();
    const [customers, threshold] = await Promise.all([loadCustomerStats(admin), regularThreshold(admin)]);
    const segmentTotal = customers.filter((c) => inSegment(c, segment, now, threshold)).length;
    const recipients = selectRecipients(customers, segment, now, threshold);

    if (!confirm) {
      return NextResponse.json({ count: recipients.length, segmentTotal, configured: whatsappConfigured() });
    }

    if (!whatsappConfigured()) {
      return NextResponse.json({ error: ML.whatsappNotConfiguredError }, { status: 503 });
    }
    if (recipients.length === 0) {
      return NextResponse.json({ sent: 0, failed: 0, total: 0 });
    }
    if (recipients.length > MAX_RECIPIENTS) {
      return NextResponse.json(
        { error: `אפשר לשלוח עד ${MAX_RECIPIENTS} הודעות בפעם אחת. בחרו קבוצה קטנה יותר.` },
        { status: 400 },
      );
    }

    const template = template_id ? await loadTemplate(admin, template_id) : null;
    if (template_id && !template) {
      return NextResponse.json({ error: "התבנית לא נמצאה" }, { status: 404 });
    }

    const logs: LogRow[] = [];
    let sent = 0;
    let failed = 0;
    let idx = 0;
    const worker = async () => {
      while (idx < recipients.length) {
        const c = recipients[idx++];
        const res = await sendTemplated(c.phone!, template, { name: firstName(c.name), site: SITE_URL }, message ?? "");
        if (res.ok) sent += 1;
        else failed += 1;
        logs.push({
          channel: "whatsapp",
          recipient: c.phone,
          template_id: template?.id ?? null,
          status: res.ok ? "sent" : "failed",
          error: res.ok ? null : (res.error ?? null),
          kind: "broadcast",
          user_id: c.id,
        });
      }
    };
    await Promise.all(Array.from({ length: 5 }, worker));
    await writeLog(admin, logs);

    return NextResponse.json({ sent, failed, total: recipients.length });
  } catch (e) {
    if (isMissingSchema(e)) {
      return NextResponse.json({ error: "טבלאות השיווק עוד לא קיימות (צריך להריץ את מיגרציה 031)." }, { status: 503 });
    }
    console.error("marketing broadcast error:", e);
    return NextResponse.json({ error: "השליחה נכשלה. נסו שוב." }, { status: 500 });
  }
}
