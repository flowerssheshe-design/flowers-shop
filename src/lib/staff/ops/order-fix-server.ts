import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { getServerSettings } from "@/lib/settings-server";
import { currentBusinessWeek } from "@/lib/staff/week";
import { weekOrdersRange } from "@/lib/staff/work/ranges";
import { normalizeItems, orderHoldsStock, refundDueFor, swapItems } from "./orders";
import {
  applyStallMoves,
  cutStallsForShortage,
  loadStallSplit,
  returnOrderStock,
  takeOrderStock,
  undoStallMoves,
} from "./stall-split-server";

// Fixing a customer's order from the managers' screens: a bouquet the supplier
// didn't have (swap it / cancel the order), and the stall it is picked up at.

type Admin = ReturnType<typeof createAdminClient>;
type Row = Record<string, unknown>;
type Fail = { ok: false; error: string; status: number };

export type OpenOrderWithProduct = {
  id: string;
  customer_name: string;
  customer_phone: string;
  status: string;
  order_type: string;
  payment_method: string | null;
  total_amount: number;
  qty: number;
  delivery: boolean;
  stall_name: string | null;
};

const OPEN = ["pending_payment", "approved"];

async function supplierOrdered(admin: Admin, weekStart: string): Promise<boolean> {
  const { data } = await admin.from("business_weeks").select("supplier_ordered_at").eq("week_start", weekStart).maybeSingle();
  return Boolean((data as { supplier_ordered_at?: string | null } | null)?.supplier_ordered_at);
}

/** This week's open customer orders (not stall sales) that have the bouquet. */
export async function openOrdersWithProduct(admin: Admin, productId: string): Promise<OpenOrderWithProduct[]> {
  const settings = await getServerSettings();
  const week = currentBusinessWeek(settings);
  const range = weekOrdersRange(week, settings);
  const [ordersRes, stallsRes] = await Promise.all([
    admin
      .from("orders")
      .select("*")
      .in("status", OPEN)
      .neq("order_type", "stall")
      .gte("created_at", range.from)
      .lt("created_at", range.to)
      .order("created_at", { ascending: true }),
    admin.from("stalls").select("id, name"),
  ]);
  if (ordersRes.error) throw new Error(`orders: ${ordersRes.error.message}`);
  const names = new Map((stallsRes.data ?? []).map((s) => [String(s.id), String(s.name)]));
  const out: OpenOrderWithProduct[] = [];
  for (const o of (ordersRes.data ?? []) as Row[]) {
    const qty = normalizeItems(o.items)
      .filter((it) => it.productId === productId)
      .reduce((s, it) => s + it.qty, 0);
    if (qty === 0) continue;
    const stallId = o.pickup_stall_id ? String(o.pickup_stall_id) : null;
    out.push({
      id: String(o.id),
      customer_name: String(o.customer_name ?? ""),
      customer_phone: String(o.customer_phone ?? ""),
      status: String(o.status),
      order_type: String(o.order_type ?? "preorder"),
      payment_method: (o.payment_method as string | null) ?? null,
      total_amount: Number(o.total_amount) || 0,
      qty,
      delivery: (o.fulfillment_type ?? o.delivery_type) === "delivery",
      stall_name: stallId ? names.get(stallId) ?? null : null,
    });
  }
  return out;
}

async function loadOpenOrder(admin: Admin, id: string): Promise<{ ok: true; order: Row } | Fail> {
  const { data, error } = await admin.from("orders").select("*").eq("id", id).maybeSingle();
  if (error) return { ok: false, error: "לא הצלחנו לטעון את ההזמנה", status: 500 };
  if (!data) return { ok: false, error: "ההזמנה לא נמצאה", status: 404 };
  if (data.order_type === "stall") return { ok: false, error: "מכירה בדוכן מטפלים ממסך הדוכן.", status: 409 };
  if (!OPEN.includes(String(data.status))) {
    return { ok: false, error: "אפשר לשנות רק הזמנה שמחכה לתשלום או שאושרה. רעננו את הרשימה.", status: 409 };
  }
  return { ok: true, order: data as Row };
}

/**
 * The supplier didn't have a bouquet: the order gets another one instead, same
 * quantity and price. If the order holds stock, the new bouquet is taken and
 * the missing one goes back (so "how many arrived" can then go down).
 */
export async function swapOrderBouquet(
  admin: Admin,
  orderId: string,
  fromId: string,
  toId: string,
): Promise<{ ok: true } | Fail> {
  if (fromId === toId) return { ok: false, error: "בחרו זר אחר", status: 400 };
  const loaded = await loadOpenOrder(admin, orderId);
  if (!loaded.ok) return loaded;
  const o = loaded.order;
  const items = normalizeItems(o.items);
  const moving = items.filter((it) => it.productId === fromId);
  const qty = moving.reduce((s, it) => s + it.qty, 0);
  if (qty === 0) return { ok: false, error: "הזר כבר לא בהזמנה. רעננו את הרשימה.", status: 409 };

  const { data: prod } = await admin.from("products").select("id, title").eq("id", toId).maybeSingle();
  if (!prod) return { ok: false, error: "הזר שבחרתם לא נמצא", status: 404 };
  const toTitle = String(prod.title);

  const settings = await getServerSettings();
  const week = currentBusinessWeek(settings);
  const holds = orderHoldsStock(
    { inventory_deducted: o.inventory_deducted === true, order_type: String(o.order_type) },
    await supplierOrdered(admin, week.weekStart),
  );
  const stallId = (o.pickup_stall_id as string | null | undefined) ?? null;
  const fromStall = o.stall_stock_deducted === true;

  // Take the new bouquet first; if there isn't enough, nothing changes.
  let cutMoves: { stall_id: string; product_id: string; delta: number }[] = [];
  let tookFromStall = false;
  if (holds) {
    if (!fromStall) {
      // After the lock: off what no stall holds, then off the stalls that have the most.
      const cut = await cutStallsForShortage(admin, toId, qty);
      if (!cut.ok) return { ok: false, error: `אין מספיק "${toTitle}" במלאי`, status: 409 };
      cutMoves = cut.moves;
    }
    const took = await takeOrderStock(admin, [{ productId: toId, qty, title: toTitle }], fromStall ? stallId : null);
    if (!took.ok) {
      await undoStallMoves(admin, cutMoves);
      return { ok: false, error: `אין מספיק "${toTitle}" במלאי`, status: 409 };
    }
    tookFromStall = took.stallDeducted;
  }

  const next = swapItems(items, fromId, { id: toId, title: toTitle });
  const update: Row = { items: next };
  if (holds) update.inventory_deducted = o.inventory_deducted === true || o.order_type === "preorder";
  const { data: saved, error } = await admin
    .from("orders")
    .update(update)
    .eq("id", orderId)
    .eq("status", String(o.status))
    .select("id")
    .maybeSingle();
  if (error || !saved) {
    if (holds) {
      await returnOrderStock(admin, [{ productId: toId, qty }], { pickupStallId: stallId, stallDeducted: tookFromStall });
      await undoStallMoves(admin, cutMoves);
    }
    return { ok: false, error: "ההזמנה השתנתה בינתיים. רעננו ונסו שוב.", status: 409 };
  }
  // The missing bouquet goes back to the stock (and to the stall it was taken from).
  if (holds) await returnOrderStock(admin, [{ productId: fromId, qty }], { pickupStallId: stallId, stallDeducted: fromStall });
  return { ok: true };
}

/**
 * Cancels an order (its bouquets go back). Paid by Bit / PayBox: it is marked
 * with the amount to send back by hand, until a manager marks it as sent back.
 */
export async function cancelOrderWithRefund(admin: Admin, orderId: string): Promise<{ ok: true; refundDue: number | null } | Fail> {
  const loaded = await loadOpenOrder(admin, orderId);
  if (!loaded.ok) return loaded;
  const o = loaded.order;
  const items = normalizeItems(o.items);
  const settings = await getServerSettings();
  const week = currentBusinessWeek(settings);
  const holds = orderHoldsStock(
    { inventory_deducted: o.inventory_deducted === true, order_type: String(o.order_type) },
    await supplierOrdered(admin, week.weekStart),
  );
  const refundDue = refundDueFor({
    status: String(o.status),
    payment_method: (o.payment_method as string | null) ?? null,
    total_amount: Number(o.total_amount) || 0,
  });
  const update: Row = { status: "cancelled", inventory_deducted: false };
  if (o.stall_stock_deducted === true) update.stall_stock_deducted = false;
  if (refundDue !== null) update.refund_due = refundDue;

  const res = await admin.from("orders").update(update).eq("id", orderId).eq("status", String(o.status)).select("id").maybeSingle();
  if (res.error && /refund_due/.test(res.error.message)) {
    return { ok: false, error: "צריך להריץ את מיגרציה 050 כדי לסמן החזר כסף.", status: 409 };
  }
  if (res.error || !res.data) return { ok: false, error: "ההזמנה השתנתה בינתיים. רעננו ונסו שוב.", status: 409 };
  if (holds && items.length > 0) {
    await returnOrderStock(admin, items, {
      pickupStallId: (o.pickup_stall_id as string | null | undefined) ?? null,
      stallDeducted: o.stall_stock_deducted === true,
    });
  }
  return { ok: true, refundDue };
}

/** A manager sent the money back: the cancelled order stops waiting for a refund. */
export async function markRefunded(admin: Admin, orderId: string): Promise<{ ok: true } | Fail> {
  const { data, error } = await admin
    .from("orders")
    .update({ refunded_at: new Date().toISOString() })
    .eq("id", orderId)
    .not("refund_due", "is", null)
    .is("refunded_at", null)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: "השמירה נכשלה. נסו שוב.", status: 500 };
  if (!data) return { ok: false, error: "אין בהזמנה הזאת החזר שמחכה. רעננו את הרשימה.", status: 409 };
  return { ok: true };
}

/**
 * Moves an order to another pickup stall (or, for a delivery, the stall the
 * courier takes it from). Its bouquets move with it:
 * - stock taken from the stall after the lock: the old stall gets it back
 *   (to sell), the new stall gives it (all or nothing);
 * - a pre-order waiting at the stall since the lock: what each stall gets
 *   from the supplier (the runner's list) moves;
 * - before the lock with a saved split: each stall keeps its own share.
 */
export async function moveOrderStall(admin: Admin, orderId: string, toStallId: string): Promise<{ ok: true } | Fail> {
  const loaded = await loadOpenOrder(admin, orderId);
  if (!loaded.ok) return loaded;
  const o = loaded.order;
  const fromStallId = (o.pickup_stall_id as string | null | undefined) ?? null;
  if (fromStallId === toStallId) return { ok: true };
  const delivery = (o.fulfillment_type ?? o.delivery_type) === "delivery";

  const split = await loadStallSplit(admin);
  const to = split.stalls.find((s) => s.id === toStallId);
  if (!to) return { ok: false, error: "הדוכן לא נמצא או לא פעיל", status: 404 };
  if (delivery ? !to.is_delivery_point : !to.is_pickup_point) {
    return { ok: false, error: delivery ? "הדוכן הזה לא מסומן כנקודת משלוחים" : "הדוכן הזה לא מסומן כנקודת איסוף", status: 409 };
  }

  const items = normalizeItems(o.items);
  const stallDeducted = o.stall_stock_deducted === true;
  let moved: { stall_id: string; product_id: string; delta: number }[] = [];

  if (split.lockedAt && fromStallId && stallDeducted) {
    moved = items.flatMap((it) => [
      { stall_id: fromStallId, product_id: it.productId, delta: it.qty },
      { stall_id: toStallId, product_id: it.productId, delta: -it.qty },
    ]);
    const res = await applyStallMoves(admin, moved);
    if (!res.ok) {
      const title = items.find((it) => it.productId === res.failed.product_id)?.title ?? "זר";
      return { ok: false, error: `ב${to.name} אין מספיק "${title}" פנויים. אפשר להעביר זרים לשם בטבלת החלוקה.`, status: 409 };
    }
    // The stall stock moved, not what each stall got from the supplier.
    for (const m of moved) {
      const { data } = await admin.from("stall_inventory").select("initial_stock").eq("stall_id", m.stall_id).eq("product_id", m.product_id).maybeSingle();
      await admin
        .from("stall_inventory")
        .update({ initial_stock: Math.max(0, (Number(data?.initial_stock) || 0) - m.delta) })
        .eq("stall_id", m.stall_id)
        .eq("product_id", m.product_id);
    }
  }

  const { data: saved, error } = await admin
    .from("orders")
    .update({ pickup_stall_id: toStallId })
    .eq("id", orderId)
    .eq("status", String(o.status))
    .select("id")
    .maybeSingle();
  if (error || !saved) {
    if (moved.length > 0) await undoStallMoves(admin, moved);
    return { ok: false, error: "ההזמנה השתנתה בינתיים. רעננו ונסו שוב.", status: 409 };
  }

  if (split.lockedAt && fromStallId && !stallDeducted) {
    // Waiting at the stall since the lock: the bouquets for it go to the new stall.
    for (const it of items) {
      for (const [sid, d] of [
        [fromStallId, -it.qty],
        [toStallId, it.qty],
      ] as const) {
        const { data } = await admin.from("stall_inventory").select("initial_stock").eq("stall_id", sid).eq("product_id", it.productId).maybeSingle();
        if (data) {
          await admin
            .from("stall_inventory")
            .update({ initial_stock: Math.max(0, (Number(data.initial_stock) || 0) + d) })
            .eq("stall_id", sid)
            .eq("product_id", it.productId);
        } else if (d > 0) {
          await admin.from("stall_inventory").insert({ stall_id: sid, product_id: it.productId, stock: 0, initial_stock: d });
        }
      }
    }
  } else if (!split.lockedAt && split.mode === "count" && fromStallId) {
    // The saved split counts the orders in each stall: keep every stall's own share.
    for (const it of items) {
      for (const [sid, d] of [
        [fromStallId, -it.qty],
        [toStallId, it.qty],
      ] as const) {
        const { data } = await admin
          .from("stall_plan")
          .select("qty")
          .eq("week_start", split.week.weekStart)
          .eq("stall_id", sid)
          .eq("product_id", it.productId)
          .maybeSingle();
        const next = Math.max(0, (Number(data?.qty) || 0) + d);
        await admin
          .from("stall_plan")
          .upsert({ week_start: split.week.weekStart, stall_id: sid, product_id: it.productId, qty: next }, { onConflict: "week_start,stall_id,product_id" });
      }
    }
  }
  return { ok: true };
}
