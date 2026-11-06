import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/staff/guard";
import { canManageTeam } from "@/lib/staff/access";
import { isMissingTableError } from "@/lib/staff/owner/data";
import { jsonError, notConfigured, parseBody, serverError } from "@/lib/staff/ops/http";
import type { StaffRequestView } from "@/lib/staff/requests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;


const NOT_READY = "צריך להריץ את מיגרציה 046 כדי לשלוח פניות.";

/** Owners: every open request + the latest handled ones. Everyone else: their own. */
export async function GET() {
  const guard = await requireStaff("me");
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;
  const me = guard.session.employee;
  const owner = canManageTeam(me);

  try {
    const admin = createAdminClient();
    let q = admin
      .from("staff_requests")
      .select("id, employee_id, body, created_at, resolved_at, reply")
      .order("created_at", { ascending: false })
      .limit(100);
    if (!owner) q = q.eq("employee_id", me.id);
    const { data, error } = await q;
    if (error) {
      if (isMissingTableError(error)) return NextResponse.json({ ready: false, requests: [], isOwner: owner });
      return serverError(error, "requests GET");
    }
    const ids = Array.from(new Set((data ?? []).map((r) => r.employee_id).filter(Boolean) as string[]));
    const { data: emps } = ids.length ? await admin.from("employees").select("id, full_name").in("id", ids) : { data: [] };
    const names = new Map((emps ?? []).map((e) => [String(e.id), String(e.full_name)]));
    const requests: StaffRequestView[] = (data ?? []).map((r) => ({
      id: String(r.id),
      employee_id: (r.employee_id as string | null) ?? null,
      employee_name: r.employee_id ? names.get(String(r.employee_id)) ?? "עובד" : "עובד שנמחק",
      body: String(r.body),
      created_at: String(r.created_at),
      resolved_at: (r.resolved_at as string | null) ?? null,
      reply: (r.reply as string | null) ?? null,
    }));
    return NextResponse.json({ ready: true, requests, isOwner: owner });
  } catch (e) {
    return serverError(e, "requests GET");
  }
}

const Body = z.object({ body: z.string().trim().min(2, "כתבו את הפנייה (לפחות 2 תווים)").max(2000, "הפנייה ארוכה מדי") });

/** Any employee sends a request to the owners. */
export async function POST(req: Request) {
  const guard = await requireStaff("me");
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;
  const body = await parseBody(req, Body);
  if (!body.ok) return body.response;

  try {
    const { data, error } = await createAdminClient()
      .from("staff_requests")
      .insert({ employee_id: guard.session.employee.id, body: body.data.body })
      .select("id")
      .single();
    if (error) {
      if (isMissingTableError(error)) return jsonError(NOT_READY, 409);
      return serverError(error, "requests POST");
    }
    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (e) {
    return serverError(e, "requests POST");
  }
}
