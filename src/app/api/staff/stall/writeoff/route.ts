import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/lib/staff/guard";
import {
  checkStall,
  jsonError,
  NO_STALL_ACCESS,
  parseBody,
  stallAdjust,
  workContext,
} from "@/lib/staff/work/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const Body = z.object({
  stall_id: z.string().uuid(),
  product_id: z.string().uuid(),
  qty: z.number().int().min(1).max(500),
  reason: z.string().trim().max(100).default(""),
});

/** "פרח נפגע / נזרק": takes stock off the stall without an order, logged in stall_writeoffs. */
export async function POST(req: Request) {
  const guard = await requireStaff("stall");
  if (!guard.ok) return guard.response;
  const me = guard.session.employee;

  const body = await parseBody(req, Body);
  if (!body.ok) return body.response;
  const { stall_id, product_id, qty, reason } = body.data;

  try {
    const { admin, today } = await workContext();
    const stall = await checkStall(admin, me, today, stall_id);
    if (!stall) return jsonError(NO_STALL_ACCESS, 403);

    const after = await stallAdjust(admin, stall.id, product_id, -qty);
    if (after === null) return jsonError("אין מספיק מהזר הזה במלאי הדוכן", 409);

    const { error } = await admin.from("stall_writeoffs").insert({
      stall_id: stall.id,
      product_id,
      qty,
      reason,
      employee_id: me.id,
      work_date: today,
    });
    if (error) {
      await stallAdjust(admin, stall.id, product_id, qty).catch((e) =>
        console.error("write-off rollback failed:", e),
      );
      return jsonError("הרישום נכשל. נסו שוב.", 500);
    }
    return NextResponse.json({ ok: true, stock: after }, { status: 201 });
  } catch (e) {
    console.error("staff/stall/writeoff failed:", e);
    return jsonError("שגיאת שרת. נסו שוב.", 500);
  }
}
