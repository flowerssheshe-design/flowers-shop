import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/lib/staff/guard";
import { buildStallOrderItems, computeSaleTotal, qtyByProduct } from "@/lib/staff/work/sales";
import { runWithRollback, StepError, type Step } from "@/lib/staff/work/rollback";
import {
  checkStall,
  jsonError,
  NO_STALL_ACCESS,
  parseBody,
  SALES_CLOSED,
  canSellNow,
  stallAdjust,
  workContext,
} from "@/lib/staff/work/server";
import { lockStallsIfDue } from "@/lib/staff/ops/stall-split-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const Body = z.object({
  stall_id: z.string().uuid(),
  payment_method: z.enum(["cash", "bit"]),
  items: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        qty: z.number().int().min(1).max(500),
        unit_price: z.number().min(0).max(10000),
      }),
    )
    .min(1)
    .max(20),
});

/**
 * Records a stall sale: takes the stock off this stall (atomic, never below
 * zero) and saves a completed 'stall' order with the actual prices.
 * If any step fails, everything already applied is undone.
 */
export async function POST(req: Request) {
  const guard = await requireStaff("stall");
  if (!guard.ok) return guard.response;
  const me = guard.session.employee;

  const body = await parseBody(req, Body);
  if (!body.ok) return body.response;
  const { stall_id, payment_method, items: lines } = body.data;

  try {
    const { admin, today, now } = await workContext();
    if (!canSellNow(now)) return jsonError(SALES_CLOSED, 409);
    await lockStallsIfDue(admin);
    const stall = await checkStall(admin, me, today, stall_id);
    if (!stall) return jsonError(NO_STALL_ACCESS, 403);

    const ids = Array.from(new Set(lines.map((l) => l.product_id)));
    const { data: products, error: prodErr } = await admin
      .from("products")
      .select("id, title, image_url")
      .in("id", ids)
      .eq("is_active", true);
    if (prodErr) return jsonError("לא הצלחנו לטעון את הזרים", 500);
    const productMap = new Map((products ?? []).map((p) => [String(p.id), { ...p, id: String(p.id), title: String(p.title) }]));
    const items = buildStallOrderItems(lines, productMap);
    if (!items) return jsonError("אחד הזרים לא נמצא. רעננו את הדף ונסו שוב.", 404);

    const total = computeSaleTotal(lines);
    let orderId: string | null = null;
    let order: unknown = null;

    const steps: Step[] = [];
    for (const [productId, qty] of Array.from(qtyByProduct(items).entries())) {
      steps.push({
        run: async () => {
          const after = await stallAdjust(admin, stall.id, productId, -qty);
          if (after === null) {
            const title = productMap.get(productId)?.title ?? "";
            throw new StepError(`"${title}" אזל בדוכן או שאין מספיק במלאי`, 409);
          }
        },
        undo: async () => {
          await stallAdjust(admin, stall.id, productId, qty);
        },
      });
      // The general stock includes what is at the stalls, so a stall sale comes off it too.
      steps.push({
        run: async () => {
          const { data: after, error } = await admin.rpc("decrement_inventory", { p_product_id: productId, p_qty: qty });
          if (error || after === null || after === undefined) {
            const title = productMap.get(productId)?.title ?? "";
            throw new StepError(`"${title}" אזל במלאי הכללי`, 409);
          }
        },
        undo: async () => {
          await admin.rpc("increment_inventory", { p_product_id: productId, p_qty: qty });
        },
      });
    }
    steps.push({
      run: async () => {
        const { data, error } = await admin
          .from("orders")
          .insert({
            customer_name: "לקוח דוכן",
            customer_phone: "",
            delivery_address: null,
            items,
            total_amount: total,
            delivery_type: "pickup",
            fulfillment_type: "pickup",
            delivery_fee: 0,
            is_member: false,
            notes: `מכירה בדוכן - ${stall.name}`,
            status: "completed",
            payment_method,
            order_type: "stall",
            stall_id: stall.id,
            sold_by: me.id,
            // Came off the stall's stock and the general stock (see the steps above).
            inventory_deducted: true,
          })
          .select("id, created_at, items, total_amount, payment_method, status, sold_by")
          .single();
        if (error || !data) throw new StepError("שמירת המכירה נכשלה. נסו שוב.", 500);
        orderId = String(data.id);
        order = data;
      },
      undo: async () => {
        if (orderId) await admin.from("orders").delete().eq("id", orderId);
      },
    });

    const result = await runWithRollback(steps);
    if (!result.ok) {
      if (result.error instanceof StepError) return jsonError(result.error.message, result.error.status);
      console.error("stall sale failed:", result.error);
      return jsonError("שמירת המכירה נכשלה. נסו שוב.", 500);
    }
    return NextResponse.json({ order }, { status: 201 });
  } catch (e) {
    console.error("staff/stall/sale failed:", e);
    return jsonError("שגיאת שרת. נסו שוב.", 500);
  }
}
