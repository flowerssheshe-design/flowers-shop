import { NextResponse } from "next/server";
import { applyCookies, createClientForRoute } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST() {
  try {
    const { supabase, cookiesToSet } = await createClientForRoute();
    await supabase.auth.signOut();
    const res = NextResponse.json({ ok: true });
    return applyCookies(res, cookiesToSet);
  } catch (e) {
    console.error("logout error", e);
    return NextResponse.json({ ok: true });
  }
}