"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Archive as ArchiveIcon,
  ExternalLink,
  Loader2,
  LogOut,
  Store as StoreIcon,
  Truck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  clearAdminAuth,
  isAdminAuthenticated,
} from "@/components/AdminGate";
import { AdminNav } from "@/components/AdminNav";
import { formatILS } from "@/lib/utils";
import type { Order, TopProduct, WeeklyArchive } from "@/types";

type Payload = {
  archives: WeeklyArchive[];
  orders: Order[];
};

export default function AdminHistoryPage() {
  const [ready, setReady] = useState(false);
  const [archives, setArchives] = useState<WeeklyArchive[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdminAuthenticated()) {
      window.location.replace("/admin");
      return;
    }
    setReady(true);
    void load(null);
  }, []);

  async function load(archiveId: string | null) {
    setLoading(true);
    setError(null);
    try {
      const url = archiveId ? `/api/admin/history?id=${archiveId}` : "/api/admin/history";
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("טעינת היסטוריה נכשלה");
      const data = (await res.json()) as Payload;
      setArchives(data.archives ?? []);
      if (archiveId) {
        setOrders(data.orders ?? []);
        const arc = (data.archives ?? []).find((a) => a.id === archiveId);
        setTopProducts((arc?.top_products as TopProduct[]) ?? []);
      } else {
        setOrders([]);
        setTopProducts(
          ((data.archives?.[0]?.top_products as TopProduct[]) ?? []),
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    clearAdminAuth();
    window.location.replace("/admin");
  }

  const current = useMemo(
    () => archives.find((a) => a.id === selected) ?? null,
    [archives, selected],
  );

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

      <div className="container space-y-6 py-6">
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <ArchiveIcon className="h-6 w-6 text-primary" />
            היסטוריית שבועות
          </h1>
          <p className="text-sm text-muted-foreground">
            בחרו שבוע ארכיון לצפייה בנתונים המלאים.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">בחירת שבוע:</label>
          <select
            value={selected ?? ""}
            onChange={(e) => {
              const id = e.target.value || null;
              setSelected(id);
              void load(id);
            }}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">— בחרו שבוע —</option>
            {archives.map((a) => (
              <option key={a.id} value={a.id}>
                {`שבוע ${isoWeekNumber(a.week_start)}: ${formatRange(a.week_start, a.week_end)}`}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : !current ? (
          <p className="text-center text-sm text-muted-foreground py-10">
            אין שבועות בארכיון עדיין.
          </p>
        ) : (
          <>
            {/* Summary cards */}
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryCard
                title="סה״כ הכנסות"
                value={formatILS(current.total_revenue)}
                subtitle={`מוצרים ${formatILS(current.products_revenue)} · משלוחים ${formatILS(current.delivery_revenue)}`}
              />
              <SummaryCard
                title="הזמנות"
                value={String(current.orders_count)}
                subtitle={`${current.pickup_count} איסוף · ${current.delivery_count} משלוח`}
              />
              <SummaryCard
                title="לקוחות קבועים"
                value={String(current.member_orders_count)}
                subtitle={`${current.new_customers_count} חדשים · ${current.returning_customers_count} חוזרים`}
              />
              <SummaryCard
                title="תאריכים"
                value={formatRange(current.week_start, current.week_end)}
                subtitle={`שבוע מס׳ ${isoWeekNumber(current.week_start)}`}
              />
            </section>

            {/* Top products */}
            <section className="rounded-xl border bg-card p-4 shadow-sm">
              <h2 className="mb-3 text-lg font-bold">זרים מובילים בשבוע</h2>
              {topProducts.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  אין נתונים.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="p-2 text-start">#</th>
                        <th className="p-2 text-start">זר</th>
                        <th className="p-2 text-start">יחידות</th>
                        <th className="p-2 text-start">הכנסה</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topProducts.map((p, i) => (
                        <tr key={p.product_id ?? i} className="border-t">
                          <td className="p-2">{i + 1}</td>
                          <td className="p-2">{p.title}</td>
                          <td className="p-2">{p.units}</td>
                          <td className="p-2 tabular-nums font-medium">
                            {formatILS(p.revenue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Archived orders */}
            <section className="rounded-xl border bg-card p-4 shadow-sm">
              <h2 className="mb-3 text-lg font-bold">יומן הזמנות בשבוע זה</h2>
              {orders.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  אין הזמנות בשבוע זה.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="p-2 text-start">תאריך</th>
                        <th className="p-2 text-start">לקוח</th>
                        <th className="p-2 text-start">טלפון</th>
                        <th className="p-2 text-start">סוג</th>
                        <th className="p-2 text-start">סכום</th>
                        <th className="p-2 text-start">סטטוס</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((o) => (
                        <tr key={o.id} className="border-t">
                          <td className="p-2 whitespace-nowrap tabular-nums">
                            {new Date(o.created_at).toLocaleString("he-IL")}
                          </td>
                          <td className="p-2">{o.customer_name}</td>
                          <td className="p-2" dir="ltr">
                            {o.customer_phone}
                          </td>
                          <td className="p-2">
                            <span className="inline-flex items-center gap-1">
                              {o.delivery_type === "delivery" ? (
                                <Truck className="h-3.5 w-3.5" />
                              ) : (
                                <StoreIcon className="h-3.5 w-3.5" />
                              )}
                              {o.delivery_type === "delivery"
                                ? "משלוח"
                                : "איסוף"}
                            </span>
                          </td>
                          <td className="p-2 tabular-nums font-medium">
                            {formatILS(o.total_amount)}
                          </td>
                          <td className="p-2">
                            <span className="inline-flex items-center gap-1">
                              {o.is_member && (
                                <Sparkles className="h-3 w-3 text-gold" />
                              )}
                              {o.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function SummaryCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="mb-1 text-xs font-medium text-muted-foreground">
        {title}
      </div>
      <div className="brand-serif text-xl font-bold text-primary">{value}</div>
      {subtitle && (
        <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}

function formatRange(a: string, b: string) {
  const f = (s: string) =>
    new Date(s).toLocaleDateString("he-IL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  return `${f(a)} – ${f(b)}`;
}

function isoWeekNumber(iso: string) {
  const d = new Date(iso);
  const target = new Date(d.valueOf());
  const dayNr = (d.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((target.valueOf() - firstThursday.valueOf()) / 86400000 -
        3 +
        ((firstThursday.getUTCDay() + 6) % 7)) /
        7,
    );
  return String(week);
}