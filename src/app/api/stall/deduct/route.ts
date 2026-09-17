import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED } from "@/lib/constants";
import { z } from "zod";
import { getStoreMode, isRealtimeMode } from "@/lib/storeMode";

const DeductSchema = z.object({
  product_id: z.string().uuid(),
  qty: z.number().int().min(1),
  reason: z.string().min(1).max(100),
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  try {
    const store = cookies();
    if (store.get("flowers_stall_auth")?.value !== "1") {
      return NextResponse.json({ error: "נדרש זיהוי דוכן" }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: "נדרש זיהוי דוכן" }, { status: 401 });
  }

  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json({ error: "המערכת אינה מוגדרת" }, { status: 503 });
  }

  const storeMode = await getStoreMode();
  if (!isRealtimeMode(storeMode)) {
    return NextResponse.json(
      { error: "קיזוז מלאי זמין רק במצב מכירה חיה (Real-Time Mode)" },
      { status: 400 },
    );
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "שגיאה בקריאת הנתונים" }, { status: 400 });
  }

  const parsed = DeductSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "נתונים לא תקינים", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { product_id, qty, reason } = parsed.data;

  try {
    const admin = createAdminClient();

    // First check current stock to give a better error message
    const { data: currentStock, error: stockErr } = await admin
      .from("inventory")
      .select("live_stock_count")
      .eq("product_id", product_id)
      .single();

    if (stockErr || currentStock === null) {
      return NextResponse.json(
        { error: "מוצר לא נמצא במלאי" },
        { status: 404 },
      );
    }

    const available = currentStock.live_stock_count ?? 0;

    if (available <= 0) {
      return NextResponse.json(
        { error: "המלאי נגמר" },
        { status: 409 },
      );
    }

    if (qty > available) {
      return NextResponse.json(
        { error: `הכמות המבוקשת (${qty}) גדולה מהמלאי הזמין (${available})` },
        { status: 409 },
      );
    }

    const { data: after, error: decErr } = await admin.rpc("decrement_inventory", {
      p_product_id: product_id,
      p_qty: qty,
    });

    if (decErr || after === null || after === undefined) {
      return NextResponse.json(
        { error: "אין מספיק מלאי לביצוע הקיזוז" },
        { status: 409 },
      );
    }

    return NextResponse.json({ ok: true, remaining: after, reason });
  } catch (e) {
    console.error("Deduct exception:", e);
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}
