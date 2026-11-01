import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/staff/guard";
import { isMissingSchema } from "@/lib/staff/marketing/data";
import { TemplateBody, templateError } from "@/lib/staff/marketing/template-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLS = "id, name, body, meta_template_name, language, created_at, updated_at";

export async function GET() {
  const guard = await requireStaff("marketing_whatsapp");
  if (!guard.ok) return guard.response;
  const admin = createAdminClient();
  const { data, error } = await admin.from("whatsapp_templates").select(COLS).order("created_at", { ascending: false });
  if (error) {
    if (isMissingSchema(error)) {
      return NextResponse.json({ error: "טבלאות הוואטסאפ עוד לא קיימות (צריך להריץ את מיגרציה 031)." }, { status: 503 });
    }
    console.error("templates list error:", error);
    return NextResponse.json({ error: "טעינת התבניות נכשלה. נסו שוב." }, { status: 500 });
  }
  return NextResponse.json({ templates: data ?? [] });
}

export async function POST(req: Request) {
  const guard = await requireStaff("marketing_whatsapp");
  if (!guard.ok) return guard.response;
  const parsed = TemplateBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: templateError(parsed.error) }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("whatsapp_templates")
    .insert({ ...parsed.data, meta_template_name: parsed.data.meta_template_name || null })
    .select(COLS)
    .single();
  if (error) {
    console.error("template insert error:", error);
    return NextResponse.json({ error: "שמירת התבנית נכשלה. נסו שוב." }, { status: 500 });
  }
  return NextResponse.json({ template: data });
}
