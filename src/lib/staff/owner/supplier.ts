// Pure supplier-order math: how many of each bouquet to order this week,
// and the stock that is left for live sale after the pre-orders.

import { isCounted, orderChannel, orderItems, type OrderRow, type ProductRow, type SupplierLineRow } from "./week-math";

/**
 * How the quantity to order is set for a bouquet:
 * - "extra": pre-orders + a fixed extra.
 * - "total": a fixed total that covers pre-orders and live sale; if more were
 *   pre-ordered than that, order what was pre-ordered.
 */
export type OrderMode = "extra" | "total";

export function asOrderMode(v: unknown): OrderMode {
  return v === "total" ? "total" : "extra";
}

/** What to order from the supplier for one bouquet. */
export function finalQtyFor(mode: OrderMode, amount: number, preorderQty: number): number {
  const a = Math.max(0, Math.floor(Number(amount) || 0));
  const pre = Math.max(0, Math.floor(Number(preorderQty) || 0));
  return mode === "total" ? Math.max(a, pre) : pre + a;
}

export type SupplierLine = {
  product_id: string;
  title: string;
  /** Pre-ordered this week (from orders, always fresh). */
  preorder_qty: number;
  mode: OrderMode;
  /** The number for the mode: the extra ("extra") or the total ("total"). */
  extra_qty: number;
  /** What is actually ordered from the supplier (always finalQtyFor). */
  final_qty: number;
  /** final − pre-ordered: the stock for live sale. */
  live_qty: number;
  /** True when this line was saved before (not just the defaults). */
  saved: boolean;
};

/** Units per product in this week's pre-orders (cancelled orders excluded). */
export function preorderQuantities(orders: OrderRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const o of orders) {
    if (!isCounted(o) || o.status === "archived" || orderChannel(o) !== "preorder") continue;
    for (const it of orderItems(o)) map.set(it.productId, (map.get(it.productId) ?? 0) + it.qty);
  }
  return map;
}

export function liveStockFor(finalQty: number, preorderQty: number): number {
  return Math.max(0, Math.floor(finalQty) - Math.floor(preorderQty));
}

/**
 * Lines for the supplier screen.
 * - New line: the bouquet's default mode and number (products.order_mode /
 *   default_order_qty).
 * - Saved line: the week's mode and number; "to order" is always worked out
 *   from them and the current pre-orders (finalQtyFor).
 * - Once the order was sent (`frozen`) the saved numbers are shown as they are.
 * Inactive products appear only if they were pre-ordered or saved.
 */
export function computeSupplierLines(
  products: ProductRow[],
  preorders: Map<string, number>,
  saved: SupplierLineRow[],
  frozen = false,
): SupplierLine[] {
  const savedById = new Map(saved.map((l) => [l.product_id, l]));
  const lines: SupplierLine[] = [];
  const sorted = [...products].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.title.localeCompare(b.title, "he"),
  );
  for (const p of sorted) {
    const pre = preorders.get(p.id) ?? 0;
    const s = savedById.get(p.id);
    if (p.is_active === false && !pre && !s) continue;

    let preorder_qty = pre;
    let mode: OrderMode;
    let extra_qty: number;
    let final_qty: number;
    if (s && frozen) {
      preorder_qty = s.preorder_qty;
      mode = asOrderMode(s.order_mode);
      extra_qty = s.extra_qty;
      final_qty = s.final_qty;
    } else if (s) {
      mode = asOrderMode(s.order_mode);
      extra_qty = Math.max(0, s.extra_qty);
      final_qty = finalQtyFor(mode, extra_qty, pre);
    } else {
      mode = asOrderMode(p.order_mode);
      extra_qty = Math.max(0, Math.floor(Number(p.default_order_qty) || 0));
      final_qty = finalQtyFor(mode, extra_qty, pre);
    }
    lines.push({
      product_id: p.id,
      title: p.title,
      preorder_qty,
      mode,
      extra_qty,
      final_qty,
      live_qty: liveStockFor(final_qty, preorder_qty),
      saved: Boolean(s),
    });
  }
  return lines;
}

/** WhatsApp text for the supplier, in the spirit of lib/supplier-message.ts. */
export function buildSupplierWhatsApp(
  lines: Pick<SupplierLine, "title" | "final_qty">[],
  weekStart: string,
  weekEnd: string,
): string {
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split("-");
    return `${d}.${m}.${y}`;
  };
  const ordered = lines.filter((l) => l.final_qty > 0);
  const total = ordered.reduce((s, l) => s + l.final_qty, 0);
  const out: string[] = [];
  out.push("שלום, הזמנה שבועית מ״לתת מהלב״ 🌷");
  out.push(`שבוע ${fmt(weekStart)}–${fmt(weekEnd)}`);
  out.push("");
  if (ordered.length === 0) {
    out.push("השבוע אין הזמנה.");
  } else {
    for (const l of ordered) out.push(`• ${l.title} – ${l.final_qty}`);
    out.push("");
    out.push(`סה״כ: ${total} יחידות`);
  }
  out.push("");
  out.push("תודה רבה!");
  return out.join("\n");
}
