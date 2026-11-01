import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_CONFIGURED } from "@/lib/constants";
import { clientIp, rateLimit } from "@/lib/staff/marketing/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const B64URL = /^[A-Za-z0-9_-]+=*$/;

const Body = z.object({
  endpoint: z
    .string()
    .url()
    .max(1000)
    .refine((u) => u.startsWith("https://"), "invalid endpoint"),
  keys: z.object({
    p256dh: z.string().min(20).max(200).regex(B64URL),
    auth: z.string().min(8).max(100).regex(B64URL),
  }),
});

const Unsubscribe = z.object({ endpoint: z.string().url().max(1000) });

async function currentUserId(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

/** Public: stores a browser's push subscription (with the user id when logged in). */
export async function POST(req: Request) {
  if (!rateLimit(`push-sub:${clientIp(req)}`, 10, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "יותר מדי בקשות. נסו שוב בעוד כמה דקות." }, { status: 429 });
  }
  if (!SUPABASE_CONFIGURED) return NextResponse.json({ error: "השירות אינו זמין" }, { status: 503 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "נתונים לא תקינים" }, { status: 400 });

  const userId = await currentUserId();
  const admin = createAdminClient();
  const row: Record<string, unknown> = {
    endpoint: parsed.data.endpoint,
    p256dh: parsed.data.keys.p256dh,
    auth: parsed.data.keys.auth,
  };
  // Don't wipe a known user with null when the same browser subscribes logged out.
  if (userId) row.user_id = userId;

  const { error } = await admin.from("push_subscriptions").upsert(row, { onConflict: "endpoint" });
  if (error) {
    console.error("push subscribe error:", error.message);
    return NextResponse.json({ error: "ההרשמה להתראות נכשלה. נסו שוב." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/** Public: removes a subscription (the browser knows its own endpoint). */
export async function DELETE(req: Request) {
  if (!rateLimit(`push-unsub:${clientIp(req)}`, 10, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "יותר מדי בקשות" }, { status: 429 });
  }
  if (!SUPABASE_CONFIGURED) return NextResponse.json({ ok: true });
  const parsed = Unsubscribe.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "נתונים לא תקינים" }, { status: 400 });
  const admin = createAdminClient();
  await admin.from("push_subscriptions").delete().eq("endpoint", parsed.data.endpoint);
  return NextResponse.json({ ok: true });
}
