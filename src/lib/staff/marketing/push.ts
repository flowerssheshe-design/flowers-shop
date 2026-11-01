import "server-only";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "./data";
import { writeLog, type LogRow } from "./whatsapp-send";

type Admin = ReturnType<typeof createAdminClient>;

export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "";

export function pushConfigured(): boolean {
  return Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT);
}

let vapidSet = false;
function ensureVapid() {
  if (vapidSet) return;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  vapidSet = true;
}

export type PushPayload = { title: string; body: string; url: string };

type SubRow = { id: string; endpoint: string; p256dh: string; auth: string };

export async function countSubscribers(admin: Admin): Promise<number> {
  const { count, error } = await admin.from("push_subscriptions").select("id", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * Sends a notification to every subscriber, removes subscriptions the browser
 * has revoked (404/410), and logs every attempt to message_log.
 */
export async function sendPushToAll(
  admin: Admin,
  payload: PushPayload,
): Promise<{ sent: number; failed: number; removed: number; total: number }> {
  ensureVapid();
  const subs = await fetchAll<SubRow>((a, b) =>
    admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").order("created_at").range(a, b) as never,
  );
  const body = JSON.stringify(payload);
  const logs: LogRow[] = [];
  const gone: string[] = [];
  let sent = 0;
  let failed = 0;
  let idx = 0;

  const worker = async () => {
    while (idx < subs.length) {
      const s = subs[idx++];
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
          { TTL: 60 * 60 * 12, urgency: "normal" },
        );
        sent += 1;
        logs.push({ channel: "push", recipient: s.id, status: "sent", kind: "push_broadcast" });
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) gone.push(s.id);
        failed += 1;
        logs.push({
          channel: "push",
          recipient: s.id,
          status: "failed",
          error: code ? `HTTP ${code}` : e instanceof Error ? e.message.slice(0, 200) : "error",
          kind: "push_broadcast",
        });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(10, Math.max(1, subs.length)) }, worker));

  for (let i = 0; i < gone.length; i += 200) {
    await admin.from("push_subscriptions").delete().in("id", gone.slice(i, i + 200));
  }
  await writeLog(admin, logs);
  return { sent, failed, removed: gone.length, total: subs.length };
}
