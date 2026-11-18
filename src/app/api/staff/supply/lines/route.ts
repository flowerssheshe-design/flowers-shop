import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/lib/staff/guard";
import { jsonError, parseBody, workContext } from "@/lib/staff/work/server";
import { cutStallsForShortage, loadStallSplit, undoStallMoves } from "@/lib/staff/ops/stall-split-server";
import { checkFreeQty } from "@/lib/staff/ops/stall-split";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const Body = z
  .object({
    product_id: z.string().uuid(),
    picked_up: z.boolean().optional(),
    /** How many really came from the supplier (free ones included). Changes the stock by the difference. */
    received_qty: z.number().int().min(0).max(10_000).optional(),
    /** How many of what came were free (not paid to the supplier). */
    free_qty: z.number().int().min(0).max(10_000).optional(),
    /** What was really paid per bouquet this week (replaces the cost price in the profit). */
    unit_cost: z.number().min(0).max(100_000).nullable().optional(),
  })
  .refine(
    (v) => v.picked_up !== undefined || v.received_qty !== undefined || v.free_qty !== undefined || v.unit_cost !== undefined,
    { message: "nothing to change" },
  );

/**
 * Updates a line of this week's supplier order: picked up (the supply runner),
 * how many really arrived and how many of them were free, and the price paid
 * per bouquet (the managers). The stock moves by the difference. A bouquet
 * that wasn't in the order gets a new line.
 *
 * After the stall split was locked only this bouquet changes: more = it waits
 * outside the stalls for the managers to give it out; fewer = it comes off
 * what no stall holds, then off the stalls that have the most.
 */
export async function PATCH(req: Request) {
  // The supply runner, and the managers (who write what arrived, from stall management).
  const guard = await requireStaff(["supply", "stalls"]);
  if (!guard.ok) return guard.response;

  const body = await parseBody(req, Body);
  if (!body.ok) return body.response;
  const v = body.data;

  try {
    const { admin, week } = await workContext();
    const [lineRes, weekRes] = await Promise.all([
      admin.from("supplier_order_lines").select("*").eq("week_start", week.weekStart).eq("product_id", v.product_id).maybeSingle(),
      admin.from("business_weeks").select("supplier_ordered_at").eq("week_start", week.weekStart).maybeSingle(),
    ]);
    if (lineRes.error) return jsonError("לא הצלחנו לטעון את ההזמנה מהספק", 500);
    const line = lineRes.data as { final_qty?: number; received_qty?: number | null; free_qty?: number | null } | null;
    const ordered = Boolean((weekRes.data as { supplier_ordered_at?: string | null } | null)?.supplier_ordered_at);

    if (!line && v.received_qty === undefined && v.unit_cost === undefined && v.free_qty === undefined) {
      return jsonError("הזר לא נמצא בהזמנה מהספק של השבוע", 404);
    }

    const before = Number(line?.received_qty ?? line?.final_qty ?? 0);
    const received = v.received_qty ?? before;
    const free = v.free_qty ?? Number(line?.free_qty ?? 0);
    const freeErr = checkFreeQty(received, free);
    if (freeErr) return jsonError(freeErr, 400);

    // Stock: the website stock was set from the ordered amount; move it by what really came.
    let stockDelta = 0;
    let stallMoves: { stall_id: string; product_id: string; delta: number }[] = [];
    if (v.received_qty !== undefined) {
      if (!ordered) return jsonError("אפשר לעדכן כמה הגיע רק אחרי שההזמנה מהספק סומנה כנשלחה.", 409);
      stockDelta = v.received_qty - before;
      if (stockDelta > 0) {
        const { error } = await admin.rpc("increment_inventory", { p_product_id: v.product_id, p_qty: stockDelta });
        if (error) return jsonError("עדכון המלאי נכשל. נסו שוב.", 500);
      } else if (stockDelta < 0) {
        const held = async () => {
          const { data: inv } = await admin.from("inventory").select("live_stock_count").eq("product_id", v.product_id).maybeSingle();
          const left = Number(inv?.live_stock_count) || 0;
          return jsonError(
            `יש הזמנות של לקוחות שמחכות לזר הזה: אפשר להוריד מהמלאי עד ${left}, כלומר לרשום לפחות ${before - left}. ` +
              "קודם החליפו לזר אחר או בטלו את ההזמנות ברשימה שמתחת, ואז שמרו שוב.",
            409,
          );
        };
        // After the lock: take the missing ones off the stalls first (this bouquet only).
        const cut = await cutStallsForShortage(admin, v.product_id, -stockDelta);
        if (!cut.ok) return held();
        stallMoves = cut.moves;
        const { data: after, error } = await admin.rpc("decrement_inventory", { p_product_id: v.product_id, p_qty: -stockDelta });
        if (error || after === null || after === undefined) {
          await undoStallMoves(admin, stallMoves);
          return held();
        }
      }
    }

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { updated_at: now };
    if (v.picked_up !== undefined) patch.picked_up = v.picked_up;
    if (v.received_qty !== undefined) patch.received_qty = v.received_qty;
    if (v.free_qty !== undefined) patch.free_qty = v.free_qty;
    if (v.unit_cost !== undefined) patch.unit_cost = v.unit_cost === null ? null : Math.round(v.unit_cost * 100) / 100;

    const res = line
      ? await admin.from("supplier_order_lines").update(patch).eq("week_start", week.weekStart).eq("product_id", v.product_id).select("*")
      : await admin
          .from("supplier_order_lines")
          .insert({ week_start: week.weekStart, product_id: v.product_id, preorder_qty: 0, extra_qty: 0, final_qty: 0, ...patch })
          .select("*");
    if (res.error || !res.data?.length) {
      // Undo the stock move so the stock and the line stay in step.
      if (stockDelta > 0) await admin.rpc("decrement_inventory", { p_product_id: v.product_id, p_qty: stockDelta });
      if (stockDelta < 0) {
        await admin.rpc("increment_inventory", { p_product_id: v.product_id, p_qty: -stockDelta });
        await undoStallMoves(admin, stallMoves);
      }
      const msg = res.error?.message ?? "";
      if (/free_qty/.test(msg)) return jsonError("צריך להריץ את מיגרציה 050 כדי לרשום זרים בחינם.", 409);
      const missing = /received_qty|unit_cost/.test(msg);
      return jsonError(
        missing ? "צריך להריץ את מיגרציה 046 כדי לעדכן כמה הגיע וכמה שולם." : "השמירה נכשלה. נסו שוב.",
        missing ? 409 : 500,
      );
    }

    // More than counted after the lock: they wait outside the stalls for a manager to give them out.
    let toSplit = 0;
    if (stockDelta > 0) {
      const split = await loadStallSplit(admin).catch(() => null);
      if (split?.lockedAt) toSplit = stockDelta;
    }
    const cutFromStalls = stallMoves.reduce((s, m) => s - m.delta, 0);
    return NextResponse.json({ line: res.data[0], stockDelta, toSplit, cutFromStalls });
  } catch (e) {
    console.error("staff/supply/lines failed:", e);
    return jsonError("שגיאת שרת. נסו שוב.", 500);
  }
}
