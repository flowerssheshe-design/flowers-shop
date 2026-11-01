import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/staff/guard";
import { addDays, israelTimeToDate } from "@/lib/staff/week";
import {
  computeAnalytics,
  customerKey,
  isOnlineOrder,
  resolvePeriod,
  type AnalyticsOrderRow,
  type LinkRow,
  type SignupRow,
  type VisitRow,
} from "@/lib/staff/marketing/analytics";
import { fetchAll, isMissingSchema } from "@/lib/staff/marketing/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>;

/** GET ?period=week|4weeks|custom&from=YYYY-MM-DD&to=YYYY-MM-DD — aggregates only. */
export async function GET(req: Request) {
  const guard = await requireStaff("marketing");
  if (!guard.ok) return guard.response;

  const sp = new URL(req.url).searchParams;
  const period = resolvePeriod(sp.get("period"), sp.get("from"), sp.get("to"));
  if (!period) {
    return NextResponse.json({ error: "טווח התאריכים לא תקין (עד שנה אחת)." }, { status: 400 });
  }
  const start = israelTimeToDate(period.from, 0).toISOString();
  const end = israelTimeToDate(addDays(period.to, 1), 0).toISOString();

  try {
    const admin = createAdminClient();

    const [visits, signups, orders, prior, links] = await Promise.all([
      fetchAll<VisitRow>((a, b) =>
        admin
          .from("site_visits")
          .select("session_id, created_at, tracking_link_id")
          .gte("created_at", start)
          .lt("created_at", end)
          .order("created_at")
          .range(a, b) as unknown as Page<VisitRow>,
      ),
      fetchAll<SignupRow>((a, b) =>
        admin
          .from("profiles")
          .select("created_at, signup_link_id")
          .gte("created_at", start)
          .lt("created_at", end)
          .order("created_at")
          .range(a, b) as unknown as Page<SignupRow>,
      ),
      fetchAll<AnalyticsOrderRow>((a, b) =>
        admin
          .from("orders")
          .select("id, user_id, customer_phone, created_at, status, items, tracking_link_id, order_type")
          .gte("created_at", start)
          .lt("created_at", end)
          .neq("status", "cancelled")
          .order("created_at")
          .range(a, b) as unknown as Page<AnalyticsOrderRow>,
      ),
      fetchAll<Pick<AnalyticsOrderRow, "id" | "user_id" | "customer_phone" | "order_type">>((a, b) =>
        admin
          .from("orders")
          .select("id, user_id, customer_phone, order_type")
          .lt("created_at", start)
          .neq("status", "cancelled")
          .order("created_at")
          .range(a, b) as unknown as Page<Pick<AnalyticsOrderRow, "id" | "user_id" | "customer_phone" | "order_type">>,
      ),
      fetchAll<LinkRow>((a, b) =>
        admin.from("tracking_links").select("id, name, slug").order("created_at").range(a, b) as unknown as Page<LinkRow>,
      ),
    ]);

    const priorKeys = new Set(prior.filter(isOnlineOrder).map(customerKey));
    const result = computeAnalytics({ ...period, visits, signups, orders, priorCustomerKeys: priorKeys, links });
    return NextResponse.json(result);
  } catch (e) {
    if (isMissingSchema(e) || (e instanceof Error && /does not exist|could not find/i.test(e.message))) {
      return NextResponse.json(
        { error: "טבלאות השיווק עוד לא קיימות במסד הנתונים (צריך להריץ את מיגרציה 031)." },
        { status: 503 },
      );
    }
    console.error("marketing analytics error:", e);
    return NextResponse.json({ error: "טעינת הנתונים נכשלה. נסו שוב." }, { status: 500 });
  }
}
