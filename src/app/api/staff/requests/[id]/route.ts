import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/staff/guard";
import { canManageTeam } from "@/lib/staff/access";
import { UUID_RE, jsonError, notConfigured, parseBody, serverError } from "@/lib/staff/ops/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const Body = z.object({
  /** true = handled (with an optional reply the employee sees), false = open again. */
  resolved: z.boolean(),
  reply: z.string().trim().max(2000).optional(),
});

/** Owners mark a request as handled (or open again). */
export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const guard = await requireStaff("me", canManageTeam);
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;
  if (!UUID_RE.test(ctx.params.id)) return jsonError("הפנייה לא נמצאה", 404);
  const body = await parseBody(req, Body);
  if (!body.ok) return body.response;

  try {
    const update = body.data.resolved
      ? { resolved_at: new Date().toISOString(), resolved_by: guard.session.employee.id, reply: body.data.reply || null }
      : { resolved_at: null, resolved_by: null };
    const { data, error } = await createAdminClient().from("staff_requests").update(update).eq("id", ctx.params.id).select("id");
    if (error) return serverError(error, "request PATCH");
    if (!data || data.length === 0) return jsonError("הפנייה לא נמצאה", 404);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e, "request PATCH");
  }
}

/** Delete a request: owners any request, an employee their own. */
export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  const guard = await requireStaff("me");
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;
  if (!UUID_RE.test(ctx.params.id)) return jsonError("הפנייה לא נמצאה", 404);
  const me = guard.session.employee;

  try {
    let q = createAdminClient().from("staff_requests").delete().eq("id", ctx.params.id);
    if (!canManageTeam(me)) q = q.eq("employee_id", me.id);
    const { data, error } = await q.select("id");
    if (error) return serverError(error, "request DELETE");
    if (!data || data.length === 0) return jsonError("הפנייה לא נמצאה", 404);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e, "request DELETE");
  }
}
