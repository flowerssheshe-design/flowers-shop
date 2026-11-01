import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/constants";
import { getServerSettings } from "@/lib/settings-server";
import { israelTimeToDate } from "@/lib/staff/week";
import {
  isPreorderClosingDue,
  parseConfig,
  refs,
  selectPreorderClosing,
  selectWinBack,
  type AutomationKind,
} from "./automations";
import { loadCustomerStats } from "./data";
import { firstName } from "./templates";
import { claimAndSend, existingRefs, loadTemplate, whatsappConfigured, type WhatsAppTemplate } from "./whatsapp-send";

type Admin = ReturnType<typeof createAdminClient>;

export type AutomationRow = {
  kind: AutomationKind;
  is_enabled: boolean;
  template_id: string | null;
  config: unknown;
};

export type RunSummary = Record<
  AutomationKind,
  { status: "off" | "not_due" | "no_template" | "ran"; sent: number; failed: number; skipped: number }
>;

export function formatDeadline(at: Date): string {
  return at.toLocaleString("he-IL", {
    timeZone: "Asia/Jerusalem",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function loadAutomations(admin: Admin): Promise<Map<AutomationKind, AutomationRow>> {
  const { data, error } = await admin.from("message_automations").select("kind, is_enabled, template_id, config");
  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as AutomationRow[]).map((r) => [r.kind, r]));
}

const MAX_PER_RUN = 300;

/** Runs every due automation once. Safe to call as often as you like. */
export async function runAutomations(now: Date = new Date()): Promise<RunSummary | { notConfigured: true }> {
  if (!whatsappConfigured()) return { notConfigured: true };
  const admin = createAdminClient();
  const autos = await loadAutomations(admin);
  const summary: RunSummary = {
    preorder_closing: { status: "off", sent: 0, failed: 0, skipped: 0 },
    order_thanks: { status: "off", sent: 0, failed: 0, skipped: 0 },
    win_back: { status: "off", sent: 0, failed: 0, skipped: 0 },
  };

  const templateFor = async (kind: AutomationKind): Promise<WhatsAppTemplate | null | "off"> => {
    const row = autos.get(kind);
    if (!row?.is_enabled) return "off";
    const t = await loadTemplate(admin, row.template_id);
    if (!t) summary[kind].status = "no_template";
    return t;
  };

  let customers: Awaited<ReturnType<typeof loadCustomerStats>> | null = null;
  const getCustomers = async () => (customers ??= await loadCustomerStats(admin));

  const sendAll = async (
    kind: AutomationKind,
    template: WhatsAppTemplate,
    items: { ref: string; userId: string | null; phone: string; name: string | null; deadline?: string }[],
  ) => {
    const done = await existingRefs(admin, kind, items.map((i) => i.ref));
    const todo = items.filter((i) => !done.has(i.ref));
    summary[kind].skipped += items.length - todo.length;
    for (const i of todo.slice(0, MAX_PER_RUN)) {
      const r = await claimAndSend(admin, {
        kind,
        ref: i.ref,
        userId: i.userId,
        phone: i.phone,
        template,
        vars: { name: firstName(i.name), deadline: i.deadline, site: SITE_URL },
      });
      if (r === "sent") summary[kind].sent += 1;
      else if (r === "failed") summary[kind].failed += 1;
      else summary[kind].skipped += 1;
    }
  };

  // 1. Pre-order closing reminder.
  {
    const t = await templateFor("preorder_closing");
    if (t && t !== "off") {
      const settings = await getServerSettings();
      const cfg = parseConfig("preorder_closing", autos.get("preorder_closing")?.config);
      const { due, window } = isPreorderClosingDue(settings, cfg.hours_before, now);
      if (!due) summary.preorder_closing.status = "not_due";
      else {
        summary.preorder_closing.status = "ran";
        const weekStartAt = israelTimeToDate(window.week.weekStart, 0);
        const list = selectPreorderClosing(await getCustomers(), weekStartAt);
        const deadline = formatDeadline(window.sendUntil);
        await sendAll(
          "preorder_closing",
          t,
          list.map((c) => ({
            ref: refs.preorderClosing(window.week.weekStart, c.id),
            userId: c.id,
            phone: c.phone!,
            name: c.name,
            deadline,
          })),
        );
      }
    }
  }

  // 2. Win-back.
  {
    const t = await templateFor("win_back");
    if (t && t !== "off") {
      summary.win_back.status = "ran";
      const cfg = parseConfig("win_back", autos.get("win_back")?.config);
      const list = selectWinBack(await getCustomers(), cfg.weeks, now);
      await sendAll(
        "win_back",
        t,
        list.map((c) => ({ ref: refs.winBack(c.id, c.lastOrderAt!), userId: c.id, phone: c.phone!, name: c.name })),
      );
    }
  }

  // 3. Order thanks — catch-up for recent orders the order flow didn't thank.
  {
    const t = await templateFor("order_thanks");
    if (t && t !== "off") {
      summary.order_thanks.status = "ran";
      const since = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();
      const { data } = await admin
        .from("orders")
        .select("id, user_id, customer_name, customer_phone, status, order_type")
        .gte("created_at", since)
        .neq("status", "cancelled")
        .in("order_type", ["preorder", "live"])
        .limit(MAX_PER_RUN);
      const optedOut = await optedOutUsers(admin, (data ?? []).map((o) => (o as { user_id: string | null }).user_id));
      const items = ((data ?? []) as OrderLite[])
        .filter((o) => !(o.user_id && optedOut.has(o.user_id)))
        .map((o) => ({ ...o, phone: toPhone(o.customer_phone) }))
        .filter((o) => !!o.phone)
        .map((o) => ({ ref: refs.orderThanks(o.id), userId: o.user_id, phone: o.phone!, name: o.customer_name }));
      await sendAll("order_thanks", t, items);
    }
  }

  return summary;
}

type OrderLite = {
  id: string;
  user_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  status: string | null;
  order_type?: string | null;
};

function toPhone(raw: string | null): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D/g, "");
  if (d.length < 9 || d.length > 15) return null;
  if (d.startsWith("972")) return d;
  return d.startsWith("0") ? "972" + d.slice(1) : d;
}

async function optedOutUsers(admin: Admin, ids: (string | null)[]): Promise<Set<string>> {
  const list = Array.from(new Set(ids.filter((x): x is string => !!x)));
  if (list.length === 0) return new Set();
  const { data } = await admin.from("profiles").select("id, notification_opt_in").in("id", list);
  return new Set(
    ((data ?? []) as { id: string; notification_opt_in: boolean | null }[])
      .filter((p) => p.notification_opt_in === false)
      .map((p) => p.id),
  );
}

export type OrderThanksResult = { status: "sent" | "failed" | "skipped"; reason?: string };

/**
 * Sends the "thanks for your order" WhatsApp for one order, if that automation
 * is on. Idempotent (one message per order) and never throws, so the order
 * flow can call it without awaiting the outcome.
 */
export async function sendOrderThanks(orderId: string): Promise<OrderThanksResult> {
  try {
    if (!whatsappConfigured()) return { status: "skipped", reason: "not_configured" };
    const admin = createAdminClient();
    const autos = await loadAutomations(admin);
    const row = autos.get("order_thanks");
    if (!row?.is_enabled) return { status: "skipped", reason: "off" };
    const template = await loadTemplate(admin, row.template_id);
    if (!template) return { status: "skipped", reason: "no_template" };

    const { data: order } = await admin
      .from("orders")
      .select("id, user_id, customer_name, customer_phone, status, order_type")
      .eq("id", orderId)
      .maybeSingle();
    const o = order as OrderLite | null;
    if (!o || o.status === "cancelled") return { status: "skipped", reason: "no_order" };
    if (o.order_type && o.order_type !== "preorder" && o.order_type !== "live") {
      return { status: "skipped", reason: "not_online" };
    }
    if (o.user_id && (await optedOutUsers(admin, [o.user_id])).has(o.user_id)) {
      return { status: "skipped", reason: "opted_out" };
    }
    const phone = toPhone(o.customer_phone);
    if (!phone) return { status: "skipped", reason: "no_phone" };

    const r = await claimAndSend(admin, {
      kind: "order_thanks",
      ref: refs.orderThanks(o.id),
      userId: o.user_id,
      phone,
      template,
      vars: { name: firstName(o.customer_name), site: SITE_URL },
    });
    return r === "duplicate" ? { status: "skipped", reason: "already_sent" } : { status: r };
  } catch (e) {
    console.error("sendOrderThanks error:", e);
    return { status: "failed", reason: e instanceof Error ? e.message : "error" };
  }
}
