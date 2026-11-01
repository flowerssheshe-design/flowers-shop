import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/staff/guard";
import { isUuid } from "@/lib/staff/marketing/tracking";
import { TemplateBody, templateError } from "@/lib/staff/marketing/template-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLS = "id, name, body, meta_template_name, language, created_at, updated_at";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const guard = await requireStaff("marketing_whatsapp");
  if (!guard.ok) return guard.response;
  if (!isUuid(params.id)) return NextResponse.json({ error: "התבנית לא נמצאה" }, { status: 404 });

  const parsed = TemplateBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: templateError(parsed.error) }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("whatsapp_templates")
    .update({ ...parsed.data, meta_template_name: parsed.data.meta_template_name || null })
    .eq("id", params.id)
    .select(COLS)
    .maybeSingle();
  if (error) {
    console.error("template update error:", error);
    return NextResponse.json({ error: "שמירת התבנית נכשלה. נסו שוב." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "התבנית לא נמצאה" }, { status: 404 });
  return NextResponse.json({ template: data });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requireStaff("marketing_whatsapp");
  if (!guard.ok) return guard.response;
  if (!isUuid(params.id)) return NextResponse.json({ error: "התבנית לא נמצאה" }, { status: 404 });

  const admin = createAdminClient();
  const { error } = await admin.from("whatsapp_templates").delete().eq("id", params.id);
  if (error) {
    console.error("template delete error:", error);
    return NextResponse.json({ error: "המחיקה נכשלה. נסו שוב." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
