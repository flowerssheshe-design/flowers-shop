import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/staff/guard";
import { sundayOf } from "@/lib/staff/pay-context";
import { isMissingTableError } from "@/lib/staff/owner/data";
import { jsonError, notConfigured, parseBody, serverError } from "@/lib/staff/ops/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const Body = z.object({
  employee_id: z.string().uuid(),
  week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  part: z.union([z.enum(["base", "responsibility"]), z.string().regex(/^entry:[0-9a-f-]{36}$/i)]),
  /** true = ✗ (not paid this week), false = ✓ (paid as usual). */
  excluded: z.boolean(),
});

/** ✓/✗ on one part of an employee's pay for one week (owners only). */
export async function PUT(req: Request) {
  const guard = await requireStaff("payroll");
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;
  const body = await parseBody(req, Body);
  if (!body.ok) return body.response;
  const v = body.data;
  const week = sundayOf(v.week_start);

  try {
    const admin = createAdminClient();
    const { error } = v.excluded
      ? await admin.from("payroll_exclusions").upsert(
          { week_start: week, employee_id: v.employee_id, part: v.part, created_by: guard.session.employee.id },
          { onConflict: "week_start,employee_id,part", ignoreDuplicates: true },
        )
      : await admin.from("payroll_exclusions").delete().eq("week_start", week).eq("employee_id", v.employee_id).eq("part", v.part);
    if (error) {
      if (isMissingTableError(error)) return jsonError("צריך להריץ את מיגרציה 047 כדי לסמן ✗ על חלק מהשכר.", 409);
      return serverError(error, "payroll exclusion PUT");
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e, "payroll exclusion PUT");
  }
}
