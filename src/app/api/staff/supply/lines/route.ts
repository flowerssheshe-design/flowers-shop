import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/lib/staff/guard";
import { jsonError, parseBody, workContext } from "@/lib/staff/work/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const Body = z
  .object({
    product_id: z.string().uuid(),
    picked_up: z.boolean().optional(),
    /** How many really came from the supplier. Changes the stock by the difference. */
    received_qty: z.number().int().min(0).max(10_000).optional(),
    /** What was really paid per bouquet this week (replaces the cost price in the profit). */
    unit_cost: z.number().min(0).max(100_000).nullable().optional(),
  })
  .refine((v) => v.picked_up !== undefined || v.received_qty !== undefined || v.unit_cost !== undefined, {
    message: "nothing to change",
  });

/**
 * The supply runner updates a line of this week's supplier order: picked up,
 * how many really arrived (the stock moves by the difference) and the price
 * paid per bouquet. A bouquet that wasn't in the order gets a new line.
 */
export async function PATCH(req: Request) {
  const guard = await requireStaff("supply");
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
    const line = lineRes.data as { final_qty?: number; received_qty?: number | null } | null;
    const ordered = Boolean((weekRes.data as { supplier_ordered_at?: string | null } | null)?.supplier_ordered_at);

    if (!line && v.received_qty === undefined && v.unit_cost === undefined) {
      return jsonError("הזר לא נמצא בהזמנה מהספק של השבוע", 404);
    }

    // Stock: the website stock was set from the ordered amount; move it by what really came.
    let stockDelta = 0;
    if (v.received_qty !== undefined) {
      if (!ordered) return jsonError("אפשר לעדכן כמה הגיע רק אחרי שההזמנה מהספק סומנה כנשלחה.", 409);
      const before = Number(line?.received_qty ?? line?.final_qty ?? 0);
      stockDelta = v.received_qty - before;
      if (stockDelta > 0) {
        const { error } = await admin.rpc("increment_inventory", { p_product_id: v.product_id, p_qty: stockDelta });
        if (error) return jsonError("עדכון המלאי נכשל. נסו שוב.", 500);
      } else if (stockDelta < 0) {
        const { data: after, error } = await admin.rpc("decrement_inventory", { p_product_id: v.product_id, p_qty: -stockDelta });
        if (error || after === null || after === undefined) {
          const { data: inv } = await admin.from("inventory").select("live_stock_count").eq("product_id", v.product_id).maybeSingle();
          const left = Number(inv?.live_stock_count) || 0;
          return jsonError(
            `חלק מהזרים כבר הוזמנו או נמכרו: אפשר להוריד מהמלאי עד ${left}, כלומר לרשום לפחות ${before - left}.`,
            409,
          );
        }
      }
    }

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { updated_at: now };
    if (v.picked_up !== undefined) patch.picked_up = v.picked_up;
    if (v.received_qty !== undefined) patch.received_qty = v.received_qty;
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
      if (stockDelta < 0) await admin.rpc("increment_inventory", { p_product_id: v.product_id, p_qty: -stockDelta });
      const missing = /received_qty|unit_cost/.test(res.error?.message ?? "");
      return jsonError(
        missing ? "צריך להריץ את מיגרציה 046 כדי לעדכן כמה הגיע וכמה שולם." : "השמירה נכשלה. נסו שוב.",
        missing ? 409 : 500,
      );
    }
    return NextResponse.json({ line: res.data[0], stockDelta });
  } catch (e) {
    console.error("staff/supply/lines failed:", e);
    return jsonError("שגיאת שרת. נסו שוב.", 500);
  }
}
