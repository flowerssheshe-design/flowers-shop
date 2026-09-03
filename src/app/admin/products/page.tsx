"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  Loader2,
  LogOut,
  Pencil,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  clearAdminAuth,
  isAdminAuthenticated,
} from "@/components/AdminGate";
import { AdminNav } from "@/components/AdminNav";
import { calculateDiscountAmount, formatILS } from "@/lib/utils";
import { MEMBER_DISCOUNT_PERCENT } from "@/lib/constants";
import type { Product, SupplierAggregate } from "@/types";

export default function AdminProductsPage() {
  const [ready, setReady] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [supplier, setSupplier] = useState<SupplierAggregate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
    try {
      const [a, b] = await Promise.all([
        fetch("/api/admin/products", { cache: "no-store" }),
        fetch("/api/admin/supplier-week", { cache: "no-store" }),
      ]);
      if (!a.ok) throw new Error("טעינת מוצרים נכשלה");
      const productsData = (await a.json()) as { products: Product[] };
      setProducts(productsData.products ?? []);
      if (b.ok) {
        const sd = (await b.json()) as { aggregates: SupplierAggregate[] };
        setSupplier(sd.aggregates ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive(p: Product) {
    setProducts((prev) =>
      prev.map((x) => (x.id === p.id ? { ...x, is_active: !p.is_active } : x)),
    );
    try {
      const res = await fetch(`/api/admin/products/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !p.is_active }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setProducts((prev) =>
        prev.map((x) => (x.id === p.id ? { ...x, is_active: p.is_active } : x)),
      );
      setError("עדכון המוצר נכשל");
    }
  }

  async function move(p: Product, dir: -1 | 1) {
    const idx = products.findIndex((x) => x.id === p.id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= products.length) return;
    const reordered = [...products];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
    setProducts(reordered);
    try {
      await fetch("/api/admin/products/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order: reordered.map((r, i) => ({ id: r.id, sort_order: i })),
        }),
      });
    } catch {
      setError("עדכון הסדר נכשל");
      void load();
    }
  }

  async function softDelete(p: Product) {
    if (!confirm(`להעביר את "${p.title}" ללא פעיל?`)) return;
    setProducts((prev) =>
      prev.map((x) => (x.id === p.id ? { ...x, is_active: false } : x)),
    );
    try {
      await fetch(`/api/admin/products/${p.id}`, {
        method: "DELETE",
      });
    } catch {
      setError("מחיקה נכשלה");
      void load();
    }
  }

  function logout() {
    clearAdminAuth();
    window.location.replace("/admin");
  }

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-muted/30 pb-12">
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <div className="container flex items-center justify-between gap-2 py-3">
          <AdminNav />
          <div className="flex items-center gap-2">
            <Button asChild size="sm">
              <Link href="/admin/products/new">
                <Plus className="h-4 w-4" />
                מוצר חדש
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/" target="_blank">
                <ExternalLink className="h-4 w-4" />
                חנות
              </Link>
            </Button>
            <Button size="sm" variant="ghost" onClick={logout}>
              <LogOut className="h-4 w-4" />
              יציאה
            </Button>
          </div>
        </div>
      </header>

      <div className="container space-y-4 py-4">
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <section className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">הזמנת ספקים — השבוע</h2>
            <span className="text-xs text-muted-foreground">
              ראשון–שבת
            </span>
          </div>
          {supplier.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              אין הזמנות פעילות השבוע.
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {supplier.map((s) => (
                <li
                  key={s.product_id}
                  className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm"
                >
                  <span className="font-medium">{s.title}</span>
                  <span className="font-bold tabular-nums text-primary">
                    {s.total_qty}×
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <table className="w-full text-sm">
               <thead className="bg-muted/50 text-start text-xs uppercase text-muted-foreground">
                 <tr>
                   <th className="p-3 text-start">שם</th>
                   <th className="p-3 text-start">מחיר ליחידה</th>
                   <th className="p-3 text-start">הנחה %{MEMBER_DISCOUNT_PERCENT}</th>
                   <th className="p-3 text-start">מחיר לקוח קבוע</th>
                   <th className="p-3 text-start">פעיל</th>
                   <th className="p-3 text-start">סדר</th>
                   <th className="p-3 text-start">פעולות</th>
                 </tr>
               </thead>
              <tbody>
                {products.map((p, idx) => (
                  <tr key={p.id} className="border-t">
                    <td className="p-3 font-medium">{p.title}</td>
                    <td className="p-3 tabular-nums">
                      {formatILS(p.price_standard)}
                    </td>
                    <td className="p-3 tabular-nums">
                      -{formatILS(calculateDiscountAmount(p.price_standard))}
                      <div className="text-xs text-muted-foreground">
                        {MEMBER_DISCOUNT_PERCENT}%
                      </div>
                    </td>
                    <td className="p-3 tabular-nums font-medium text-primary">
                      {formatILS(p.price_member)}
                      <div className="text-xs text-muted-foreground font-normal">
                        (חישוב אוטומטי)
                      </div>
                    </td>
                    <td className="p-3">
                      <Switch
                        checked={p.is_active}
                        onCheckedChange={() => toggleActive(p)}
                        aria-label="פעיל"
                      />
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={idx === 0}
                          onClick={() => move(p, -1)}
                          aria-label="הזז למעלה"
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={idx === products.length - 1}
                          onClick={() => move(p, 1)}
                          aria-label="הזז למטה"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        <Button
                          asChild
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                        >
                          <Link href={`/admin/products/${p.id}/edit`}>
                            <Pencil className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => softDelete(p)}
                        >
                          השבת
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {products.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-muted-foreground">
                      אין מוצרים עדיין. לחצו &quot;מוצר חדש&quot;.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </main>
  );
}