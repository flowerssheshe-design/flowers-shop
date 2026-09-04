import { NextResponse } from "next/server";
import { z } from "zod";
import { applyCookies, createClientForRoute } from "@/lib/supabase/server";
import { SUPABASE_CONFIGURED } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(200),
  full_name: z.string().min(2).max(100),
  notification_opt_in: z.boolean().optional().default(true),
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
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        full_name: parsed.data.full_name,
        notification_opt_in: parsed.data.notification_opt_in,
      },
      // Skip email confirmation in dev. Remove this for production and
      // configure Supabase project's "Confirm email" setting instead.
      emailRedirectTo: undefined,
    },
  });

  if (error || !data.user) {
    return applyCookies(
      NextResponse.json(
        {
          error:
            error?.message ??
            "ההרשמה נכשלה — אם האימייל טעון אישור, בדקו את תיבת הדואר.",
        },
        { status: 400 },
      ),
      cookiesToSet,
    );
  }

  // signUp returns a user even when the session is null (email confirmation
  // required). Surface that to the client.
  if (!data.session) {
    return applyCookies(
      NextResponse.json(
        {
          error:
            "נדרש אישור אימייל. בדקו את תיבת הדואר או כבו 'Confirm email' ב-Supabase Auth settings.",
        },
        { status: 400 },
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