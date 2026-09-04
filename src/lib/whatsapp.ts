import {
  WHATSAPP_API_TOKEN,
  WHATSAPP_API_VERSION,
  WHATSAPP_CONFIGURED,
  WHATSAPP_MAX_TEXT_LENGTH,
  WHATSAPP_PHONE_ID,
} from "@/lib/constants";

export type WhatsAppSendResult = {
  ok: boolean;
  id?: string;
  error?: string;
};

export type BroadcastRecipient = {
  user_id: string;
  name: string | null;
  phone: string | null;
  opted_in: boolean;
};

export type BroadcastRecipientResult = {
  user_id: string;
  name: string | null;
  phone: string | null;
  status: "sent" | "failed" | "skipped";
  message_id?: string;
  error?: string;
};

export async function sendWhatsAppText(
  to: string,
  body: string,
  opts?: { signal?: AbortSignal },
): Promise<WhatsAppSendResult> {
  if (!WHATSAPP_CONFIGURED) {
    return {
      ok: false,
      error: "WhatsApp API לא מוגדר (חסר WHATSAPP_API_TOKEN / WHATSAPP_PHONE_ID)",
    };
  }
  const res = await fetch(
    `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { preview_url: false, body },
      }),
      signal: opts?.signal,
    },
  );

  if (!res.ok) {
    let detail: string | undefined;
    try {
      const json = await res.json().catch(() => null);
      detail = json?.error?.message;
    } catch {
      // ignore
    }
    return { ok: false, error: detail ?? `HTTP ${res.status}` };
  }

  const json = await res.json().catch(() => null);
  return { ok: true, id: json?.messages?.[0]?.id };
}

export function truncateWhatsAppBody(body: string): string {
  if (body.length <= WHATSAPP_MAX_TEXT_LENGTH) return body;
  return body.slice(0, WHATSAPP_MAX_TEXT_LENGTH);
}

export async function broadcastWhatsApp(
  recipients: BroadcastRecipient[],
  body: string,
  opts?: { concurrency?: number; signal?: AbortSignal },
): Promise<BroadcastRecipientResult[]> {
  const concurrency = Math.min(Math.max(opts?.concurrency ?? 5, 1), 10);
  const text = truncateWhatsAppBody(body);
  const results: BroadcastRecipientResult[] = new Array(recipients.length);
  let idx = 0;

  const normalize = (r: BroadcastRecipient): string | null => {
    if (!r.opted_in) return null;
    if (!r.phone) return null;
    const digits = r.phone.replace(/\D/g, "");
    if (digits.length < 7) return null;
    if (digits.startsWith("0")) return "972" + digits.slice(1);
    return digits;
  };

  const worker = async () => {
    while (idx < recipients.length) {
      const i = idx++;
      const r = recipients[i];

      if (!r.opted_in) {
        results[i] = {
          user_id: r.user_id,
          name: r.name ?? null,
          phone: r.phone ?? null,
          status: "skipped",
          error: "המשתמש לא רשום לקבלת הודעות",
        };
        continue;
      }

      const to = normalize(r);
      if (!to) {
        results[i] = {
          user_id: r.user_id,
          name: r.name ?? null,
          phone: r.phone ?? null,
          status: "skipped",
          error: "אין למשתמש טלפון נייד תקין",
        };
        continue;
      }

      try {
        const res = await sendWhatsAppText(to, text, { signal: opts?.signal });
        results[i] = {
          user_id: r.user_id,
          name: r.name ?? null,
          phone: r.phone ?? null,
          status: res.ok ? "sent" : "failed",
          message_id: res.id,
          error: res.error,
        };
      } catch (e) {
        const err = e instanceof Error ? e.message : "שגיאה לא ידועה";
        results[i] = {
          user_id: r.user_id,
          name: r.name ?? null,
          phone: r.phone ?? null,
          status: "failed",
          error: err,
        };
      }
    }
  };

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  return results;
}
