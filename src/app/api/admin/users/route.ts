import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED } from "@/lib/constants";
import type { AdminUser } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json({ users: [] });
  }
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.listUsers();
    if (error || !data) {
      return NextResponse.json(
        { error: "טעינת משתמשים נכשלה" },
        { status: 500 },
      );
    }

    const supabaseUsers = data.users;

    const { data: profiles, error: profileError } = await admin
      .from("profiles")
      .select("id, full_name, phone, address, created_at");
    if (profileError) {
      return NextResponse.json(
        { error: "טעינת פרופילים נכשלה" },
        { status: 500 },
      );
    }

    const profileMap = new Map(
      (profiles ?? []).map((p) => [
        p.id,
        {
          full_name: p.full_name,
          phone: p.phone,
          address: p.address,
          created_at: p.created_at,
        },
      ]),
    );

    const { data: allOrders, error: ordersError } = await admin
      .from("orders")
      .select("user_id, status")
      .neq("status", "archived")
      .not("user_id", "is", null);

    const countMap = new Map<string, { orders: number; completed: number }>();
    if (!ordersError && allOrders) {
      for (const o of allOrders as Array<{
        user_id: string;
        status: string;
      }>) {
        const prev = countMap.get(o.user_id) ?? { orders: 0, completed: 0 };
        prev.orders += 1;
        if (o.status === "confirmed" || o.status === "completed") {
          prev.completed += 1;
        }
        countMap.set(o.user_id, prev);
      }
    }

    const adminUsers: AdminUser[] = supabaseUsers.map((u) => {
      const prof = profileMap.get(u.id);
      const counts = countMap.get(u.id) ?? { orders: 0, completed: 0 };
      return {
        id: u.id,
        email: u.email ?? null,
        full_name: prof?.full_name ?? null,
        phone: prof?.phone ?? null,
        address: prof?.address ?? null,
        created_at: prof?.created_at ?? u.created_at ?? null,
        order_count: counts.orders,
        completed_count: counts.completed,
      };
    });

    return NextResponse.json({ users: adminUsers });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}
