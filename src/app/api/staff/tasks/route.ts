import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/staff/guard";
import { loadTasks } from "@/lib/staff/ops/tasks-server";
import { notConfigured, serverError } from "@/lib/staff/ops/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** The open tasks for this person (worked out from the data each time). */
export async function GET() {
  const guard = await requireStaff("tasks");
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;
  try {
    const tasks = await loadTasks(createAdminClient(), guard.session.employee);
    return NextResponse.json({ tasks });
  } catch (e) {
    return serverError(e, "tasks GET");
  }
}
