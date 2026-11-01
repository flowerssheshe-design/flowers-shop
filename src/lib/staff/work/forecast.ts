// Pre-order totals per product, used as the supplier pickup forecast before
// the real supplier order lines exist.

export type ForecastOrder = {
  status?: string | null;
  items?: { productId?: string; title?: string; qty?: number }[] | null;
};

export type ForecastLine = { product_id: string; title: string; qty: number };

const COUNTED = new Set(["pending_payment", "approved", "completed"]);

export function preorderTotals(
  orders: ForecastOrder[],
  titles: Map<string, string> = new Map(),
): ForecastLine[] {
  const totals = new Map<string, ForecastLine>();
  for (const o of orders) {
    if (!o.status || !COUNTED.has(o.status)) continue;
    for (const it of o.items ?? []) {
      const id = it.productId;
      const qty = Math.trunc(Number(it.qty) || 0);
      if (!id || qty <= 0) continue;
      const line = totals.get(id) ?? {
        product_id: id,
        title: titles.get(id) ?? it.title ?? "",
        qty: 0,
      };
      line.qty += qty;
      totals.set(id, line);
    }
  }
  return Array.from(totals.values()).sort((a, b) => a.title.localeCompare(b.title, "he"));
}
