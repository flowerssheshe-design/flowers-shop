import { NextResponse } from "next/server";
import { z } from "zod";
import { ADMIN_PIN, SUPABASE_CONFIGURED } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const Body = z.object({ pin: z.string().min(1).max(50) });

function okWithCookie() {
  const res = NextResponse.json({ success: true });
  const maxAge = 7 * 24 * 60 * 60;
  res.cookies.set("flowers_admin_auth", "1", {
    path: "/",
    maxAge,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  const submitted = parsed.data.pin;
  const envPin = process.env.ADMIN_PIN?.trim();

  if (envPin && envPin.length > 0) {
    if (submitted === envPin) return okWithCookie();
  }

  if (SUPABASE_CONFIGURED) {
    try {
      const { createClient } = await import("@/lib/supabase/server");
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
      if (submitted === data.value) return okWithCookie();
    } catch (e) {
      console.error(e);
    }
  }

  return NextResponse.json({ error: "קוד שגוי" }, { status: 401 });
}
