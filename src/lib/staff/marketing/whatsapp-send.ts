import "server-only";
import {
  WHATSAPP_API_TOKEN,
  WHATSAPP_API_VERSION,
  WHATSAPP_CONFIGURED,
  WHATSAPP_PHONE_ID,
} from "@/lib/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsAppText, truncateWhatsAppBody, type WhatsAppSendResult } from "@/lib/whatsapp";
import { renderTemplate, templateParameters, type TemplateVars } from "./templates";
import { ML } from "./labels";

type Admin = ReturnType<typeof createAdminClient>;

export type WhatsAppTemplate = {
  id: string;
  name: string;
  body: string;
  meta_template_name: string | null;
  language: string;
};

export function whatsappConfigured(): boolean {
  return WHATSAPP_CONFIGURED;
}

/**
 * Sends one message. A template with meta_template_name goes as an approved
 * Meta template (allowed outside the 24h window); otherwise as free text.
 * Never throws.
 */
export async function sendTemplated(
  to: string,
  template: Pick<WhatsAppTemplate, "body" | "meta_template_name" | "language"> | null,
  vars: TemplateVars,
  freeText?: string,
): Promise<WhatsAppSendResult> {
  if (!WHATSAPP_CONFIGURED) return { ok: false, error: ML.whatsappNotConfiguredError };
  try {
    if (template?.meta_template_name) {
      const params = templateParameters(template.body, vars);
      const res = await fetch(
        `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_ID}/messages`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${WHATSAPP_API_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to,
            type: "template",
            template: {
              name: template.meta_template_name,
              language: { code: template.language || "he" },
              components: params.length
                ? [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }]
                : [],
            },
          }),
        },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) return { ok: false, error: json?.error?.message ?? `HTTP ${res.status}` };
      return { ok: true, id: json?.messages?.[0]?.id };
    }
    const text = template ? renderTemplate(template.body, vars) : renderTemplate(freeText ?? "", vars);
    if (!text.trim()) return { ok: false, error: "ההודעה ריקה" };
    return await sendWhatsAppText(to, truncateWhatsAppBody(text));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "שגיאה לא ידועה" };
  }
}

export type LogRow = {
  channel: "whatsapp" | "push";
  recipient: string | null;
  template_id?: string | null;
  status: "pending" | "sent" | "failed" | "skipped";
  error?: string | null;
  kind?: string | null;
  ref?: string | null;
  user_id?: string | null;
};

/** Inserts log rows; retries without the 033 columns if that migration hasn't run. */
export async function writeLog(admin: Admin, rows: LogRow[]): Promise<void> {
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await admin.from("message_log").insert(chunk);
    if (error) {
      const legacy = chunk.map(({ kind: _k, ref: _r, user_id: _u, ...rest }) => ({
        ...rest,
        status: rest.status === "pending" ? "skipped" : rest.status,
      }));
      const retry = await admin.from("message_log").insert(legacy);
      if (retry.error) console.error("message_log insert error:", retry.error.message);
    }
  }
}

export type ClaimedSend = {
  kind: string;
  ref: string;
  userId: string | null;
  phone: string;
  template: WhatsAppTemplate;
  vars: TemplateVars;
};

/**
 * Idempotent send: claims `ref` with a pending log row (unique while pending
 * or sent, migration 033), sends, then records the result. Returns "duplicate"
 * when another run already claimed it.
 */
export async function claimAndSend(admin: Admin, s: ClaimedSend): Promise<"sent" | "failed" | "duplicate"> {
  const { data, error } = await admin
    .from("message_log")
    .insert({
      channel: "whatsapp",
      recipient: s.phone,
      template_id: s.template.id,
      status: "pending",
      kind: s.kind,
      ref: s.ref,
      user_id: s.userId,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return "duplicate";
    // Without migration 033 there is no safe way to avoid duplicates: don't send.
    console.error("message_log claim error:", error.message);
    return "failed";
  }
  const id = (data as { id: string }).id;
  const res = await sendTemplated(s.phone, s.template, s.vars);
  await admin
    .from("message_log")
    .update({ status: res.ok ? "sent" : "failed", error: res.ok ? null : (res.error ?? null) })
    .eq("id", id);
  return res.ok ? "sent" : "failed";
}

/** Refs of `kind` that were already sent (or are being sent). */
export async function existingRefs(admin: Admin, kind: string, refs: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < refs.length; i += 200) {
    const { data } = await admin
      .from("message_log")
      .select("ref")
      .eq("kind", kind)
      .in("status", ["pending", "sent"])
      .in("ref", refs.slice(i, i + 200));
    for (const r of (data ?? []) as { ref: string | null }[]) if (r.ref) out.add(r.ref);
  }
  return out;
}

export async function loadTemplate(admin: Admin, id: string | null | undefined): Promise<WhatsAppTemplate | null> {
  if (!id) return null;
  const { data } = await admin
    .from("whatsapp_templates")
    .select("id, name, body, meta_template_name, language")
    .eq("id", id)
    .maybeSingle();
  return (data as WhatsAppTemplate | null) ?? null;
}
