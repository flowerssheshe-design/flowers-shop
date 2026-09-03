import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED } from "@/lib/constants";

export const runtime = "nodejs";

const PatchSchema = z.object({
  full_name: z.string().min(2).max(100),
  phone: z.string().min(8).max(30).optional().or(z.literal("")),
  address: z.string().max(300).optional().or(z.literal("")),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json({ error: "המערכת אינה מוגדרת" }, { status: 503 });
  }
  const json = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "נתונים לא תקינים" }, { status: 400 });
  }
  try {
    const admin = createAdminClient();
    // Ensure profile row exists
    await admin.rpc("ensure_profile", { uid: id });
    const { error } = await admin
      .from("profiles")
      .update({
        full_name: parsed.data.full_name,
        phone: parsed.data.phone || null,
        address: parsed.data.address || null,
      })
      .eq("id", id);
    if (error) {
      return NextResponse.json({ error: "שמירה נכשלה" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json({ error: "המערכת אינה מוגדרת" }, { status: 503 });
  }
  try {
    const admin = createAdminClient();

    // Detach order records from the user so historical orders survive.
    // We anonymize contact info and clear user_id.
    const { error: ordersErr } = await admin
      .from("orders")
      .update({
        user_id: null,
        customer_name: "משתמש שנמחק",
        customer_phone: "0000000000",
        delivery_address: null,
      })
      .eq("user_id", id);
    if (ordersErr) {
      console.error("orders detach error:", ordersErr);
      return NextResponse.json(
        { error: "שיוך הזמנות למשתמש נכשל" },
        { status: 500 },
      );
    }

    const { error: profileErr } = await admin
      .from("profiles")
      .delete()
      .eq("id", id);
    if (profileErr) {
      console.error("profile delete error:", profileErr);
    }

    // Delete the auth user last (if allowed)
    try {
      const { error: authErr } = await admin.auth.admin.deleteUser(id);
      if (authErr) console.error("auth deleteUser error:", authErr);
    } catch (e) {
      console.error("auth deleteUser exception:", e);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}