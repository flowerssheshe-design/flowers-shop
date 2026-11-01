import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED } from "@/lib/constants";
import { isValidSlug } from "@/lib/staff/marketing/slug";
import { REF_COOKIE, REF_COOKIE_MAX_AGE, safeRedirectPath } from "@/lib/staff/marketing/tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Marketing link: /go/<slug>[?to=/same-site/path]. Remembers the link in the
 * flowers_ref cookie (30 days) so visits, signups and orders are attributed
 * to it, then sends the visitor to the store.
 */
export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const url = new URL(req.url);
  const target = safeRedirectPath(url.searchParams.get("to")) ?? "/";
  const res = NextResponse.redirect(new URL(target, url.origin), 302);
  res.headers.set("Cache-Control", "no-store");

  const slug = (params.slug ?? "").toLowerCase();
  if (!SUPABASE_CONFIGURED || !isValidSlug(slug)) return res;

  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("tracking_links")
      .select("id, is_active")
      .eq("slug", slug)
      .maybeSingle();
    const link = data as { id: string; is_active: boolean } | null;
    if (link?.is_active) {
      res.cookies.set(REF_COOKIE, link.id, {
        path: "/",
        maxAge: REF_COOKIE_MAX_AGE,
        sameSite: "lax",
        httpOnly: false,
        secure: url.protocol === "https:",
      });
    }
  } catch (e) {
    console.error("go link error:", e);
  }
  return res;
}
