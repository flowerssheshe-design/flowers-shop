import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED } from "@/lib/constants";
import { requireAdmin } from "@/lib/admin-auth";
import { formatILS } from "@/lib/utils";
import type { Order } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const ACTIVE_DELIVERY_STATUSES: Order["status"][] = ["pending", "confirmed"];

function escapeCsvField(value: string): string {
  const v = value === null || value === undefined ? "" : String(value);
  if (v.includes(",") || v.includes('"') || v.includes("\n") || v.includes("\r")) {
    return '"' + v.replace(/"/g, '""') + '"';
  }
  return v;
}

function formatOrderItems(items: Order["items"]): string {
  const list = Array.isArray(items) ? items : [];
  return list.map((it) => `${it.title} ×${it.qty}`).join(" | ");
}

function formatPaymentInfo(order: Order): string {
  const amount = formatILS(order.total_amount);
  return `${amount} — ${order.status}`;
}

function buildCsv(orders: Order[]): string {
  const headers = [
    "שם הלקוח",
    "טלפון",
    "כתובת למשלוח",
    "פירוט הזרים/הזמנה",
    "הערות למשלוח",
    "סכום לתשלום/סטטוס תשלום",
    "מספר הזמנה",
  ];

  const rows = orders.map((o) => [
    escapeCsvField(o.customer_name),
    escapeCsvField(o.customer_phone),
    escapeCsvField(o.delivery_address ?? ""),
    escapeCsvField(formatOrderItems(o.items)),
    escapeCsvField(o.notes ?? ""),
    escapeCsvField(formatPaymentInfo(o)),
    escapeCsvField(o.id),
  ]);

  return [headers, ...rows].map((row) => row.join(",")).join("\r\n");
}

export async function GET() {
  const denied = requireAdmin();
  if (denied) return denied;
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json({ csv: "", count: 0 });
  }
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("orders")
      .select("*")
      .eq("delivery_type", "delivery")
      .in("status", ACTIVE_DELIVERY_STATUSES)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: "טעינת רשימת משלוחים נכשלה" },
        { status: 500 },
      );
    }

    const orders = (data as Order[]) ?? [];
    const csv = "\uFEFF" + buildCsv(orders);

    return NextResponse.json({ csv, count: orders.length });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}
