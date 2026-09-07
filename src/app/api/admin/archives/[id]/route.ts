import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED } from "@/lib/constants";
import { requireAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const denied = requireAdmin();
  if (denied) return denied;
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json(
      { error: "המערכת אינה מוגדרת כרגע. נסו שוב מאוחר יותר." },
      { status: 503 },
    );
  }

  const { id } = await ctx.params;
  const admin = createAdminClient();
  const { error } = await admin
    .from("weekly_archives")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json(
      { error: error.message || "מחיקת הארכיון נכשלה" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
