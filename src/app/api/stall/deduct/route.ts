import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED } from "@/lib/constants";
import { z } from "zod";

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

    const { data: after, error: decErr } = await admin.rpc("decrement_inventory", {
      p_product_id: product_id,
      p_qty: qty,
    });

    if (decErr || after === null || after === undefined) {
      return NextResponse.json(
        { error: "אין מספיק מלאי לביצועיי הקיזוח" },
        { status: 409 },
      );
    }

    return NextResponse.json({ ok: true, remaining: after, reason });
  } catch (e) {
    console.error("Deduct exception:", e);
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}
