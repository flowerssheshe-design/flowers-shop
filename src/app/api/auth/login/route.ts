import { NextResponse } from "next/server";
import { z } from "zod";
import { applyCookies, createClientForRoute } from "@/lib/supabase/server";
import { SUPABASE_CONFIGURED } from "@/lib/constants";

export const runtime = "nodejs";

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(200),
});

export async function POST(req: Request) {
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json(
      { error: "שרת האימות אינו מוגדר" },
      { status: 503 },
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "נתונים לא תקינים" }, { status: 400 });
  }

  const { supabase, cookiesToSet } = await createClientForRoute();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    return applyCookies(
      NextResponse.json(
        { error: "אימייל או סיסמה שגויים" },
        { status: 401 },
      ),
      cookiesToSet,
    );
  }

  const res = NextResponse.json({
    ok: true,
    user: {
      id: data.user.id,
      email: data.user.email ?? null,
    },
  });
  return applyCookies(res, cookiesToSet);
}