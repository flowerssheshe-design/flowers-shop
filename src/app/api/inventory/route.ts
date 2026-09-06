import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED } from "@/lib/constants";
import type { Inventory } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function requireAdminOrStall(req: Request): NextResponse | null {
  const cookieStore = (req as any).cookies;
  const hasAdmin = cookieStore?.get?.("flowers_admin_auth")?.value === "1";
  const hasStall = cookieStore?.get?.("flowers_stall_auth")?.value === "1";
  if (hasAdmin || hasStall) return null;
  return NextResponse.json(
    { error: "נדרשת הזדהות מנהל או דוכן" },
    { status: 401 },
  );
}

export async function GET() {
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json({ inventory: [] });
  }
  try {
    const supabase = await createAdminClient();
    const since = new Date();
    const day = since.getDay();
    since.setDate(since.getDate() - day);
    since.setHours(0, 0, 0, 0);

    const [{ data, error }, { data: orders }] = await Promise.all([
      supabase
        .from("inventory")
        .select("*")
        .order("product_id", { ascending: true }),
      supabase
        .from("orders")
        .select("items")
        .gte("created_at", since.toISOString())
        .in("status", ["approved", "pending_payment"]),
    ]);

    if (error) {
      return NextResponse.json(
        { error: "טעינת מלאי נכשלה" },
        { status: 500 },
      );
    }

    const counts = new Map<string, number>();
    for (const o of orders ?? []) {
      const items = Array.isArray(o.items) ? o.items : [];
      for (const it of items) {
        const pid = String(it.productId);
        const qty = Number(it.qty ?? 0);
        counts.set(pid, (counts.get(pid) ?? 0) + qty);
      }
    }

    const inventory = (data ?? []).map((row) => ({
      ...row,
      reserved_orders: counts.get(row.product_id) ?? 0,
    }));

    return NextResponse.json({ inventory });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const denied = requireAdminOrStall(req);
  if (denied) return denied;
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json({ error: "המערכת אינה מוגדרת" }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "נתונים לא תקינים" },
      { status: 400 },
    );
  }
  const product_id = String(body.product_id ?? "");
  const live_stock_count = typeof body.live_stock_count === "number" ? body.live_stock_count : undefined;
  const delta = typeof body.delta === "number" ? body.delta : undefined;
  if (!product_id || (live_stock_count === undefined && delta === undefined)) {
    return NextResponse.json({ error: "יש לציין כמות או דלתא" }, { status: 400 });
  }
  try {
    const admin = createAdminClient();
    let current = live_stock_count;
    if (current === undefined && delta !== undefined) {
      const { data: inv } = await admin
        .from("inventory")
        .select("live_stock_count")
        .eq("product_id", product_id)
        .single();
      current = (inv?.live_stock_count ?? 0) + delta;
    }
    if (typeof current !== "number" || current < 0) {
      return NextResponse.json(
        { error: "כמות לא תקינה" },
        { status: 400 },
      );
    }
    const { data, error } = await admin
      .from("inventory")
      .upsert({ product_id, live_stock_count: current }, { onConflict: 'product_id' })
      .select("*")
      .single();
    if (error || !data) {
      console.error("Inventory upsert error:", error);
      return NextResponse.json(
        { error: "שגיאה בעדכון מלאי", details: error?.message },
        { status: 500 },
      );
    }
    return NextResponse.json({ inventory: data as Inventory });
  } catch (e) {
    console.error("Inventory patch exception:", e);
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}
