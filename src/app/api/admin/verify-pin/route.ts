import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_CONFIGURED } from "@/lib/constants";

export const runtime = "nodejs";

const Body = z.object({ pin: z.string().min(1).max(50) });

export async function POST(req: Request) {
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json({ error: "המערכת אינה מוגדרת" }, { status: 503 });
  }
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  const submitted = parsed.data.pin;
  const envPin = process.env.ADMIN_PIN?.trim();

  if (envPin && envPin.length > 0) {
    if (submitted === envPin) return NextResponse.json({ ok: true });
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("site_config")
      .select("value")
      .eq("key", "admin_pin")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "לא הוגדר קוד מנהל" },
        { status: 401 },
      );
    }
    if (submitted === data.value) return NextResponse.json({ ok: true });
    return NextResponse.json({ error: "קוד שגוי" }, { status: 401 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}