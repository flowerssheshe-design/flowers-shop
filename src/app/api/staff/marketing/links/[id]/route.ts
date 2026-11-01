import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/staff/guard";
import { isUuid } from "@/lib/staff/marketing/tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z
  .object({
    name: z.string().trim().min(2, "שם קצר מדי").max(80, "שם ארוך מדי").optional(),
    source: z.string().trim().max(60).optional().nullable(),
    is_active: z.boolean().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, "אין מה לשמור");

/** Rename / change source / activate or deactivate. The slug never changes (printed QR codes). */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const guard = await requireStaff("marketing_links");
  if (!guard.ok) return guard.response;
  if (!isUuid(params.id)) return NextResponse.json({ error: "קישור לא נמצא" }, { status: 404 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "נתונים לא תקינים" }, { status: 400 });
  }
  const patch: Record<string, unknown> = { ...parsed.data };
  if ("source" in patch) patch.source = parsed.data.source || null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tracking_links")
    .update(patch)
    .eq("id", params.id)
    .select("id, slug, name, source, is_active, created_at")
    .maybeSingle();
  if (error) {
    console.error("tracking link update error:", error);
    return NextResponse.json({ error: "השמירה נכשלה. נסו שוב." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "קישור לא נמצא" }, { status: 404 });
  return NextResponse.json({ link: data });
}
