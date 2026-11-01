import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/staff/guard";
import { getServerSettings } from "@/lib/settings-server";
import {
  AUTOMATION_KINDS,
  ConfigSchemas,
  DEFAULT_CONFIG,
  parseConfig,
  preorderClosingWindow,
  type AutomationKind,
} from "@/lib/staff/marketing/automations";
import { isMissingSchema } from "@/lib/staff/marketing/data";
import { loadAutomations } from "@/lib/staff/marketing/runner";
import { whatsappConfigured } from "@/lib/staff/marketing/whatsapp-send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireStaff("marketing_whatsapp");
  if (!guard.ok) return guard.response;

  try {
    const admin = createAdminClient();
    const rows = await loadAutomations(admin);
    const automations = AUTOMATION_KINDS.map((kind) => {
      const r = rows.get(kind);
      return {
        kind,
        is_enabled: r?.is_enabled ?? false,
        template_id: r?.template_id ?? null,
        config: parseConfig(kind, r?.config),
      };
    });

    // Sent in the last 30 days, per automation (counts only).
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const sent: Record<string, number> = {};
    for (const kind of AUTOMATION_KINDS) {
      const { count } = await admin
        .from("message_log")
        .select("id", { count: "exact", head: true })
        .eq("kind", kind)
        .eq("status", "sent")
        .gte("created_at", since);
      sent[kind] = count ?? 0;
    }

    const settings = await getServerSettings();
    const pre = automations.find((a) => a.kind === "preorder_closing")!;
    const win = preorderClosingWindow(settings, pre.config.hours_before ?? DEFAULT_CONFIG.preorder_closing.hours_before);

    return NextResponse.json({
      configured: whatsappConfigured(),
      cronConfigured: Boolean(process.env.CRON_SECRET),
      automations,
      sentLast30Days: sent,
      preorderClosing: {
        weekStart: win.week.weekStart,
        phase: win.week.phase,
        sendFrom: win.sendFrom.toISOString(),
        supplierOrderAt: win.sendUntil.toISOString(),
      },
    });
  } catch (e) {
    if (isMissingSchema(e)) {
      return NextResponse.json({ error: "טבלאות הוואטסאפ עוד לא קיימות (צריך להריץ את מיגרציה 031)." }, { status: 503 });
    }
    console.error("automations get error:", e);
    return NextResponse.json({ error: "הטעינה נכשלה. נסו לרענן." }, { status: 500 });
  }
}

const Body = z.object({
  kind: z.enum(AUTOMATION_KINDS as [AutomationKind, ...AutomationKind[]]),
  is_enabled: z.boolean(),
  template_id: z.string().uuid().nullable(),
  config: z.record(z.unknown()).default({}),
});

export async function PUT(req: Request) {
  const guard = await requireStaff("marketing_whatsapp");
  if (!guard.ok) return guard.response;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "נתונים לא תקינים" }, { status: 400 });
  const { kind, is_enabled, template_id } = parsed.data;

  const cfg = ConfigSchemas[kind].safeParse(parsed.data.config);
  if (!cfg.success) {
    const msg =
      kind === "preorder_closing"
        ? "מספר השעות צריך להיות בין 1 ל-72."
        : kind === "win_back"
          ? "מספר השבועות צריך להיות בין 1 ל-52."
          : "הגדרות לא תקינות";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  if (is_enabled && !template_id) {
    return NextResponse.json({ error: "כדי להפעיל צריך לבחור תבנית." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("message_automations").upsert(
    { kind, is_enabled, template_id, config: cfg.data, updated_at: new Date().toISOString() },
    { onConflict: "kind" },
  );
  if (error) {
    console.error("automation upsert error:", error);
    return NextResponse.json({ error: "השמירה נכשלה. נסו שוב." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
