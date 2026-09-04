import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_CONFIGURED } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const PatchSchema = z.object({
  status: z
    .enum(["pending", "confirmed", "completed", "cancelled"])
    .optional(),
  customer_name: z.string().min(2).max(100).optional(),
  customer_phone: z.string().min(8).max(30).optional(),
  delivery_address: z.string().max(300).nullish(),
  notes: z.string().max(500).nullish(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json(
      { error: "המערכת אינה מוגדרת" },
      { status: 503 },
    );
  }
  const { id } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "יש להתחבר תחילה" },
      { status: 401 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "נתונים לא תקינים" }, { status: 400 });
  }

  const canEditStatuses: Array<string> = ["pending", "confirmed"];
  if (
    parsed.data.status &&
    parsed.data.status !== "cancelled" &&
    !canEditStatuses.includes(parsed.data.status)
  ) {
    return NextResponse.json(
      { error: "לא ניתן לשנות סטטוס הזמנה זו" },
      { status: 403 },
    );
  }

  try {
    const { data, error } = await supabase
      .from("orders")
      .update(parsed.data)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("*")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "עדכון ההזמנה נכשל או שאינך בעל ההזמנה" },
        { status: 404 },
      );
    }

    return NextResponse.json({ order: data });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json(
      { error: "המערכת אינה מוגדרת" },
      { status: 503 },
    );
  }
  const { id } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "יש להתחבר קודם" },
      { status: 401 },
    );
  }

  try {
    const { error } = await supabase
      .from("orders")
      .update({ status: "cancelled" })
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json(
        { error: "ביטול ההזמנה נכשל" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}
