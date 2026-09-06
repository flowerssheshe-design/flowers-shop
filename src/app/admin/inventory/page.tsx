"use client";

import { useEffect, useMemo, useState } from "react";
import { LogOut, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clearAdminAuth, isAdminAuthenticated } from "@/components/AdminGate";
import { AdminNav } from "@/components/AdminNav";
import { formatILS } from "@/lib/utils";
import type { Product } from "@/types";

type SummaryRow = {
  product_id: string;
  title: string;
  price_standard: number;
  cost_price: number;
  live_stock_count: number;
  approved_orders: number;
  admin_extra: number;
};

export default function AdminInventoryPage() {
  const [ready, setReady] = useState(false);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const totalCost = useMemo(
    () => summary.reduce((sum, r) => sum + r.live_stock_count * r.cost_price, 0),
    [summary],
  );
  const totalRevenue = useMemo(
    () => summary.reduce((sum, r) => sum + r.live_stock_count * r.price_standard, 0),
    [summary],
  );
  const totalProfit = totalRevenue - totalCost;

  useEffect(() => {
    if (!isAdminAuthenticated()) {
      window.location.replace("/admin");
      return;
    }
    setReady(true);
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [p, s] = await Promise.all([
        fetch("/api/admin/products", { cache: "no-store" }).then((r) =>
          r.ok ? r.json() : { products: [] as Product[] },
        ),
        fetch("/api/admin/inventory/summary", { cache: "no-store" }).then((r) =>
          r.ok ? r.json() : { summary: [] as SummaryRow[] },
        ),
      ]);
      const products: Product[] = p.products ?? [];
      const productMap = new Map(products.map((x) => [x.id, x]));
      const summaryData: SummaryRow[] = s.summary ?? [];
      const merged = summaryData
        .filter((r) => productMap.get(r.product_id)?.is_active)
        .sort((a, b) => a.title.localeCompare(b.title, "he"));
      setSummary(merged);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <div className="container flex items-center justify-between gap-2 py-3">
          <AdminNav />
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <a href="/" target="_blank" rel="noreferrer">
                חנות
              </a>
            </Button>
            <Button size="sm" variant="ghost" onClick={clearAdminAuth}>
              <LogOut className="h-4 w-4" />
              יציאה
            </Button>
          </div>
        </div>
      </header>

      <div className="container space-y-4 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">סיכום מלאי</h1>
          <p className="text-sm text-muted-foreground">
            תצוגה בלבד — המלאי נשאר קבוע מהזמנת הספק
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <>
            <section className="rounded-xl border bg-card p-4 shadow-sm">
              <h2 className="mb-3 text-lg font-bold">סיכום פיננסי</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">סך הכל תשלום לספק</div>
                  <div className="text-lg font-semibold tabular-nums">{formatILS(totalCost)}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">צפי הכנסות כולל</div>
                  <div className="text-lg font-semibold tabular-nums">{formatILS(totalRevenue)}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">צפי רווח נקי לסיבוב</div>
                  <div className="text-lg font-semibold tabular-nums">{formatILS(totalProfit)}</div>
                </div>
              </div>
            </section>

            <div className="overflow-x-auto rounded-xl border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-3 text-right">מוצר</th>
                    <th className="p-3 text-right">מחיר</th>
                    <th className="p-3 text-right">מחיר עלות</th>
                    <th className="p-3 text-right">הזמנות לקוח שאושרו</th>
                    <th className="p-3 text-right">סך עלות לספק</th>
                    <th className="p-3 text-right">צפי רווח</th>
                    <th className="p-3 text-right">מלאי דוכן (אדמין)</th>
                    <th className="p-3 text-right">סה״כ להזמנת ספק</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((r) => {
                    const totalSupplier = r.live_stock_count;
                    const totalCostItem = totalSupplier * r.cost_price;
                    const profitPerUnit = Math.max(0, r.price_standard - r.cost_price);
                    const totalProfitItem = totalSupplier * profitPerUnit;
                    return (
                      <tr key={r.product_id} className="border-t">
                        <td className="p-3 font-medium">{r.title}</td>
                        <td className="p-3 tabular-nums">{formatILS(r.price_standard)}</td>
                        <td className="p-3 tabular-nums">{formatILS(r.cost_price)}</td>
                        <td className="p-3 tabular-nums">{r.approved_orders}</td>
                        <td className="p-3 tabular-nums">{formatILS(totalCostItem)}</td>
                        <td className="p-3 tabular-nums">{formatILS(totalProfitItem)}</td>
                        <td className="p-3 tabular-nums">{r.admin_extra}</td>
                        <td className="p-3 tabular-nums font-semibold">
                          {r.live_stock_count}
                        </td>
                      </tr>
                    );
                  })}
                  {summary.length === 0 && (
                    <tr>
                      <td
                        colSpan={8}
                        className="p-6 text-center text-muted-foreground"
                      >
                        אין מוצרים פעילים.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
