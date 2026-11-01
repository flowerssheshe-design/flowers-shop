import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/staff/guard";
import { fetchAll, isMissingSchema } from "@/lib/staff/marketing/data";
import { isValidSlug } from "@/lib/staff/marketing/slug";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>;

type LinkRow = { id: string; slug: string; name: string; source: string | null; is_active: boolean; created_at: string };

export type LinkWithStats = LinkRow & { visits: number; signups: number; orders: number; revenue: number };

const MISSING = "טבלת קישורי המעקב עוד לא קיימת במסד הנתונים (צריך להריץ את מיגרציה 031).";

/** All links with all-time stats: visits (sessions), signups, orders and revenue (non-cancelled). */
export async function GET() {
  const guard = await requireStaff("marketing_links");
  if (!guard.ok) return guard.response;

  try {
    const admin = createAdminClient();
    const [links, visits, signups, orders] = await Promise.all([
      fetchAll<LinkRow>((a, b) =>
        admin
          .from("tracking_links")
          .select("id, slug, name, source, is_active, created_at")
          .order("created_at", { ascending: false })
          .range(a, b) as unknown as Page<LinkRow>,
      ),
      fetchAll<{ tracking_link_id: string; session_id: string }>((a, b) =>
        admin
          .from("site_visits")
          .select("tracking_link_id, session_id")
          .not("tracking_link_id", "is", null)
          .order("created_at")
          .range(a, b) as unknown as Page<{ tracking_link_id: string; session_id: string }>,
      ),
      fetchAll<{ signup_link_id: string }>((a, b) =>
        admin
          .from("profiles")
          .select("signup_link_id")
          .not("signup_link_id", "is", null)
          .order("created_at")
          .range(a, b) as unknown as Page<{ signup_link_id: string }>,
      ),
      fetchAll<{ tracking_link_id: string; total_amount: number | string | null }>((a, b) =>
        admin
          .from("orders")
          .select("tracking_link_id, total_amount")
          .not("tracking_link_id", "is", null)
          .neq("status", "cancelled")
          .order("created_at")
          .range(a, b) as unknown as Page<{ tracking_link_id: string; total_amount: number | string | null }>,
      ),
    ]);

    const sessions = new Map<string, Set<string>>();
    for (const v of visits) {
      let s = sessions.get(v.tracking_link_id);
      if (!s) sessions.set(v.tracking_link_id, (s = new Set()));
      s.add(v.session_id);
    }
    const signupCount = new Map<string, number>();
    for (const p of signups) signupCount.set(p.signup_link_id, (signupCount.get(p.signup_link_id) ?? 0) + 1);
    const orderStats = new Map<string, { orders: number; revenue: number }>();
    for (const o of orders) {
      const s = orderStats.get(o.tracking_link_id) ?? { orders: 0, revenue: 0 };
      s.orders += 1;
      s.revenue += Number(o.total_amount) || 0;
      orderStats.set(o.tracking_link_id, s);
    }

    const result: LinkWithStats[] = links.map((l) => ({
      ...l,
      visits: sessions.get(l.id)?.size ?? 0,
      signups: signupCount.get(l.id) ?? 0,
      orders: orderStats.get(l.id)?.orders ?? 0,
      revenue: Math.round((orderStats.get(l.id)?.revenue ?? 0) * 100) / 100,
    }));
    return NextResponse.json({ links: result });
  } catch (e) {
    if (isMissingSchema(e)) return NextResponse.json({ error: MISSING }, { status: 503 });
    console.error("tracking links list error:", e);
    return NextResponse.json({ error: "טעינת הקישורים נכשלה. נסו שוב." }, { status: 500 });
  }
}

const CreateBody = z.object({
  name: z.string().trim().min(2, "שם קצר מדי").max(80, "שם ארוך מדי"),
  slug: z.string().trim().toLowerCase(),
  source: z.string().trim().max(60).optional().nullable(),
});

export async function POST(req: Request) {
  const guard = await requireStaff("marketing_links");
  if (!guard.ok) return guard.response;

  const parsed = CreateBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "נתונים לא תקינים" }, { status: 400 });
  }
  const { name, slug, source } = parsed.data;
  if (!isValidSlug(slug)) {
    return NextResponse.json(
      { error: "הקוד בקישור יכול להכיל רק אותיות באנגלית קטנות, ספרות ומקפים (2–49 תווים)." },
      { status: 400 },
    );
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("tracking_links")
      .insert({ name, slug, source: source || null })
      .select("id, slug, name, source, is_active, created_at")
      .single();
    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "כבר יש קישור עם הקוד הזה. בחרו קוד אחר." }, { status: 409 });
      }
      if (isMissingSchema(error)) return NextResponse.json({ error: MISSING }, { status: 503 });
      console.error("tracking link insert error:", error);
      return NextResponse.json({ error: "יצירת הקישור נכשלה. נסו שוב." }, { status: 500 });
    }
    return NextResponse.json({ link: { ...data, visits: 0, signups: 0, orders: 0, revenue: 0 } });
  } catch (e) {
    console.error("tracking link insert exception:", e);
    return NextResponse.json({ error: "יצירת הקישור נכשלה. נסו שוב." }, { status: 500 });
  }
}
