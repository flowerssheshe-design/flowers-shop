import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/lib/staff/guard";
import {
  checkStall,
  jsonError,
  NO_STALL_ACCESS,
  parseBody,
  workContext,
} from "@/lib/staff/work/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const Body = z.object({
  stall_id: z.string().uuid(),
  is_open: z.boolean(),
});

/** The stall seller opens and closes the stall; the storefront shows it as open. */
export async function POST(req: Request) {
  const guard = await requireStaff("stall");
  if (!guard.ok) return guard.response;
  const me = guard.session.employee;

  const body = await parseBody(req, Body);
  if (!body.ok) return body.response;
  const { stall_id, is_open } = body.data;

  try {
    const { admin, today } = await workContext();
    const stall = await checkStall(admin, me, today, stall_id);
    if (!stall) return jsonError(NO_STALL_ACCESS, 403);

    const { data, error } = await admin
      .from("stalls")
      .update({ is_open })
      .eq("id", stall.id)
      .select("id, is_open")
      .single();
    if (error || !data) return jsonError("העדכון נכשל. נסו שוב.", 500);
    return NextResponse.json({ stall: data });
  } catch (e) {
    console.error("staff/stall/open failed:", e);
    return jsonError("שגיאת שרת. נסו שוב.", 500);
  }
}
