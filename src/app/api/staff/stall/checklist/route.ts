import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/lib/staff/guard";
import { checkStall, jsonError, NO_STALL_ACCESS, parseBody, workContext } from "@/lib/staff/work/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const Body = z.object({
  stall_id: z.string().uuid(),
  kind: z.enum(["open", "close"]),
  checked_item_ids: z.array(z.string().uuid()).max(100),
  notes: z.string().trim().max(500).optional().nullable(),
});

/** Saves today's opening / closing equipment checklist of a stall (one per kind per day). */
export async function POST(req: Request) {
  const guard = await requireStaff("stall");
  if (!guard.ok) return guard.response;
  const me = guard.session.employee;

  const body = await parseBody(req, Body);
  if (!body.ok) return body.response;
  const { stall_id, kind, checked_item_ids, notes } = body.data;

  try {
    const { admin, today } = await workContext();
    const stall = await checkStall(admin, me, today, stall_id);
    if (!stall) return jsonError(NO_STALL_ACCESS, 403);

    const { data, error } = await admin
      .from("stall_checklists")
      .upsert(
        {
          stall_id: stall.id,
          employee_id: me.id,
          work_date: today,
          kind,
          checked_item_ids: Array.from(new Set(checked_item_ids)),
          notes: notes || null,
        },
        { onConflict: "stall_id,work_date,kind" },
      )
      .select("kind, checked_item_ids, notes, created_at")
      .single();
    if (error) return jsonError("שמירת הציוד נכשלה. נסו שוב.", 500);
    return NextResponse.json({ checklist: data });
  } catch (e) {
    console.error("staff/stall/checklist failed:", e);
    return jsonError("שגיאת שרת. נסו שוב.", 500);
  }
}
