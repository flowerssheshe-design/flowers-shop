"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toaster";
import { StaffPageHeader } from "@/components/staff/StaffShell";
import { calculateMemberPrice, cn, formatILS } from "@/lib/utils";
import { useSystemSettings } from "@/lib/useSystemSettings";
import type { Product } from "@/types";
import { EmptyState, ErrorState, LoadingState, RefreshButton, sendJson, useStaffJson } from "../shared";

type StaffProduct = Product & { default_order_qty?: number | null };

function margin(p: StaffProduct) {
  if (!p.price_standard) return "—";
  return `${Math.round(((p.price_standard - p.cost_price) / p.price_standard) * 100)}%`;
}

export function ProductsView() {
  const { data, setData, error, loading, reload } = useStaffJson<{ products: StaffProduct[] }>("/api/admin/products");
  const memberPercent = Number(useSystemSettings().member_discount_percent) || 0;
  const { toast } = useToast();
  const products = data?.products ?? [];

  function setProducts(next: StaffProduct[]) {
    setData({ products: next });
  }

  async function toggleActive(p: StaffProduct) {
    const before = products;
    setProducts(products.map((x) => (x.id === p.id ? { ...x, is_active: !p.is_active } : x)));
    try {
      await sendJson(`/api/admin/products/${p.id}`, "PATCH", { is_active: !p.is_active });
    } catch {
      setProducts(before);
      toast({ title: "העדכון נכשל. נסו שוב.", variant: "error" });
    }
  }

  async function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= products.length) return;
    const before = products;
    const next = [...products];
    [next[index], next[target]] = [next[target], next[index]];
    setProducts(next);
    try {
      await sendJson("/api/admin/products/reorder", "POST", { order: next.map((r, i) => ({ id: r.id, sort_order: i })) });
    } catch {
      setProducts(before);
      toast({ title: "שינוי הסדר נכשל. נסו שוב.", variant: "error" });
    }
  }

  async function remove(p: StaffProduct) {
    if (!window.confirm(`למחוק את "${p.title}" לצמיתות? אי אפשר לבטל. אם רק רוצים להסתיר אותו מהחנות, כבו את "פעיל".`)) return;
    try {
      await sendJson(`/api/admin/products/${p.id}`, "DELETE");
      setProducts(products.filter((x) => x.id !== p.id));
      toast({ title: "הזר נמחק", variant: "success" });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "המחיקה נכשלה", variant: "error" });
    }
  }

  const actions = (p: StaffProduct, i: number) => (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" disabled={i === 0} onClick={() => void move(i, -1)} aria-label={`הזזת ${p.title} למעלה`}>
        <ArrowUp className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" disabled={i === products.length - 1} onClick={() => void move(i, 1)} aria-label={`הזזת ${p.title} למטה`}>
        <ArrowDown className="h-4 w-4" />
      </Button>
      <Button asChild variant="ghost" size="icon" aria-label={`עריכת ${p.title}`}>
        <Link href={`/staff/products/${p.id}/edit`}>
          <Pencil className="h-4 w-4" />
        </Link>
      </Button>
      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => void remove(p)} aria-label={`מחיקת ${p.title}`}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );

  return (
    <div>
      <StaffPageHeader refresh={false}
        title="מוצרים"
        description="הזרים בחנות: מחיר, מחיר קנייה, כמות לספק וסדר התצוגה"
        actions={
          <>
            <RefreshButton onClick={() => void reload()} loading={loading} />
            <Button asChild size="lg">
              <Link href="/staff/products/new">
                <Plus className="h-4 w-4" />
                זר חדש
              </Link>
            </Button>
          </>
        }
      />

      {error && !data && <ErrorState message={error} onRetry={() => void reload()} />}
      {loading && !data && <LoadingState />}
      {data && products.length === 0 && <EmptyState title="עוד אין זרים" hint="לחצו על ״זר חדש״ כדי להוסיף." />}

      {products.length > 0 && (
        <>
          {/* mobile: cards */}
          <ul className="space-y-3 md:hidden">
            {products.map((p, i) => (
              <li key={p.id} className={cn("rounded-xl border bg-card p-4 shadow-sm", !p.is_active && "opacity-60")}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{p.title}</div>
                    <div className="text-sm text-muted-foreground">
                      {formatILS(p.price_standard)} · לקוח קבוע {formatILS(calculateMemberPrice(p.price_standard, memberPercent))}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      קנייה {formatILS(p.cost_price)} · רווח {margin(p)} · לספק {p.default_order_qty ?? 0}
                    </div>
                  </div>
                  <label className="flex shrink-0 items-center gap-2 text-sm">
                    <Switch checked={p.is_active} onCheckedChange={() => void toggleActive(p)} aria-label={`${p.title} פעיל בחנות`} />
                  </label>
                </div>
                <div className="mt-2 flex justify-end">{actions(p, i)}</div>
              </li>
            ))}
          </ul>

          {/* desktop: table */}
          <div className="hidden overflow-hidden rounded-xl border bg-card shadow-sm md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="p-3 text-start font-medium">זר</th>
                  <th className="p-3 text-start font-medium">מחיר</th>
                  <th className="p-3 text-start font-medium">לקוח קבוע ({memberPercent}%)</th>
                  <th className="p-3 text-start font-medium">קנייה</th>
                  <th className="p-3 text-start font-medium">רווח</th>
                  <th className="p-3 text-start font-medium">כמות לספק</th>
                  <th className="p-3 text-start font-medium">פעיל</th>
                  <th className="p-3 text-start font-medium">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p, i) => (
                  <tr key={p.id} className={cn("border-t", !p.is_active && "text-muted-foreground")}>
                    <td className="p-3 font-medium">{p.title}</td>
                    <td className="p-3 tabular-nums">{formatILS(p.price_standard)}</td>
                    <td className="p-3 tabular-nums">{formatILS(calculateMemberPrice(p.price_standard, memberPercent))}</td>
                    <td className="p-3 tabular-nums">{formatILS(p.cost_price)}</td>
                    <td className="p-3 tabular-nums">
                      {formatILS(Math.max(0, p.price_standard - p.cost_price))} ({margin(p)})
                    </td>
                    <td className="p-3 tabular-nums">{p.default_order_qty ?? 0}</td>
                    <td className="p-3">
                      <Switch checked={p.is_active} onCheckedChange={() => void toggleActive(p)} aria-label={`${p.title} פעיל בחנות`} />
                    </td>
                    <td className="p-3">{actions(p, i)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
