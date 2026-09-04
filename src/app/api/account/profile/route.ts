import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const Body = z.object({
  full_name: z.string().min(2).max(100).optional(),
  phone: z.string().min(8).max(30).optional().or(z.literal("")),
  address: z.string().max(300).optional().or(z.literal("")),
  notification_opt_in: z.boolean().optional(),
});

export async function PATCH(req: Request) {
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json(
      { error: "המערכת אינה מוגדרת" },
      { status: 503 },
    );
  }
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "נתונים לא תקינים" }, { status: 400 });
  }

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

  try {
    const admin = createAdminClient();
    const updates: Record<string, unknown> = {};
    if (parsed.data.full_name !== undefined)
      updates.full_name = parsed.data.full_name;
    if (parsed.data.phone !== undefined)
      updates.phone = parsed.data.phone || null;
    if (parsed.data.address !== undefined)
      updates.address = parsed.data.address || null;
    if (parsed.data.notification_opt_in !== undefined)
      updates.notification_opt_in = parsed.data.notification_opt_in;
    const { error } = await admin
      .from("profiles")
      .update(updates)
      .eq("id", user.id);
    if (error) {
      return NextResponse.json(
        { error: "שמירה נכשלה" },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}