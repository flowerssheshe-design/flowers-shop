import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_CONFIGURED } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const sessionId = typeof body.session_id === "string" ? body.session_id.trim() : "";

    if (!sessionId) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const supabase = await createClient();

    const { error } = await supabase.from("site_visits").insert({
      session_id: sessionId,
    });

    if (error && error.code !== "23505") {
      console.error("track-visit error:", error.message);
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: true }, { status: 200 });
  }
}
