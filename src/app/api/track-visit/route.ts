import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED } from "@/lib/constants";
import { REF_COOKIE, cleanReferrer, isTrackedPath } from "@/lib/staff/marketing/tracking";
import { readCookie, resolveActiveLinkId } from "@/lib/staff/marketing/ref-server";
import { isMissingSchema } from "@/lib/staff/marketing/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  session_id: z.string().trim().min(1).max(100),
  landing_path: z.string().max(300).optional().nullable(),
  referrer: z.string().max(500).optional().nullable(),
});

export async function POST(request: Request) {
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  try {
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }
    const { session_id, landing_path } = parsed.data;

    // Never count staff / back-office pages.
    if (landing_path && !isTrackedPath(landing_path)) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const admin = createAdminClient();
    const trackingLinkId = await resolveActiveLinkId(admin, readCookie(request, REF_COOKIE));
    const ownHost = new URL(request.url).host;

    const row = {
      session_id,
      tracking_link_id: trackingLinkId,
      landing_path: landing_path ?? null,
      referrer: cleanReferrer(parsed.data.referrer, ownHost),
    };

    let { error } = await admin.from("site_visits").insert(row);
    if (error && isMissingSchema(error)) {
      // Migration 031 not run yet: keep counting plain visits.
      ({ error } = await admin.from("site_visits").insert({ session_id }));
    }

    if (error && error.code !== "23505") {
      console.error("track-visit error:", error.message);
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: true }, { status: 200 });
  }
}
