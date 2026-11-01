import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/staff/guard";
import { getServerSettings } from "@/lib/settings-server";
import { buildCustomerList } from "@/lib/staff/owner/customers";
import { loadAllAuthUsers, loadProfiles } from "@/lib/staff/owner/customers-server";
import { notConfigured, serverError } from "@/lib/staff/owner/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Customers list. ?q= searches name, phone and email. */
export async function GET(req: Request) {
  const guard = await requireStaff("customers");
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;
  const query = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 100);

  try {
    const admin = createAdminClient();
    const [profiles, users, ordersRes, linksRes, settings] = await Promise.all([
      loadProfiles(admin),
      loadAllAuthUsers(admin),
      admin.from("orders").select("user_id, status, created_at").not("user_id", "is", null).limit(50000),
      admin.from("tracking_links").select("id, name"),
      getServerSettings(),
    ]);
    if (ordersRes.error) throw new Error(`orders: ${ordersRes.error.message}`);

    const customers = buildCustomerList({
      users,
      profiles,
      orders: (ordersRes.data ?? []) as { user_id: string; status: string; created_at: string }[],
      links: (linksRes.data ?? []) as { id: string; name: string }[],
      threshold: Number(settings.club_discount_threshold) || 0,
      memberPercent: Number(settings.member_discount_percent) || 0,
      query,
    });
    return NextResponse.json({ customers });
  } catch (e) {
    return serverError("customers", e);
  }
}
