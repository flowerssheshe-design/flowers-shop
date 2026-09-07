"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  ArrowDownRight,
  ExternalLink,
  Loader2,
  LogOut,
  RefreshCw,
  Truck,
  Store as StoreIcon,
  Sparkles,
  ShoppingBag,
  TrendingUp,
  Package,
  Users,
  Wallet,
  Percent,
  CircleDollarSign,
  TrendingDown,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  clearAdminAuth,
  isAdminAuthenticated,
} from "@/components/AdminGate";
import { AdminNav } from "@/components/AdminNav";
import { formatILS } from "@/lib/utils";
import type { TopProduct, WeeklyKpi } from "@/types";

type StatsPayload = {
  kpi: WeeklyKpi;
  previousKpi: WeeklyKpi;
  topProducts: TopProduct[];
  suppliers: TopProduct[];
  memberRatio: { members: number; total: number; percent: number };
  fulfillment: {
    pickup: number;
    delivery: number;
    pickupPercent: number;
    deliveryPercent: number;
  };
  weekStart: string;
  weekEnd: string;
  threshold: number;
};

export default function AdminStatsPage() {
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<StatsPayload | null>(null);
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
      const res = await fetch("/api/admin/stats", { cache: "no-store" });
      if (!res.ok) throw new Error("טעינת נתונים נכשלה");
      const data = (await res.json()) as StatsPayload;
      setData(data);
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
        <div className="container flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
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

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold">סטטיסטיקות וביצועים</h1>
            {data && (
              <p className="text-sm text-muted-foreground">
                שבוע נוכחי ({formatDateRange(data.weekStart, data.weekEnd)})
              </p>
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => load()}
            disabled={loading}
            className="border-primary/20 hover:border-primary/40 hover:bg-primary/5"
          >
            <RefreshCw className={`h-4 w-4 ml-1.5 ${loading ? "animate-spin" : ""}`} />
            רענון
          </Button>
        </div>

        {loading || !data ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <>
            {/* KPI cards */}
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                icon={<Wallet className="h-5 w-5" />}
                title="הכנסות השבוע"
                value={formatILS(data.kpi.total_revenue)}
                subtitle={`מוצרים ${formatILS(data.kpi.products_revenue)} · משלוחים ${formatILS(data.kpi.delivery_revenue)}`}
                delta={percentChange(
                  data.kpi.total_revenue,
                  data.previousKpi.total_revenue,
                )}
              />
              <KpiCard
                icon={<ShoppingBag className="h-5 w-5" />}
                title="מספר הזמנות"
                value={String(data.kpi.orders_count)}
                subtitle={`ממתינות + מאושרות + שהושלמו`}
                delta={percentChange(
                  data.kpi.orders_count,
                  data.previousKpi.orders_count,
                )}
              />
              <KpiCard
                icon={<Eye className="h-5 w-5" />}
                title="ביקורים באתר"
                value={String(data.kpi.visitors_count)}
                subtitle="מבקרים ייחודיים השבוע"
              />
              <KpiCard
                icon={<TrendingUp className="h-5 w-5" />}
                title="ממוצע הזמנה (AOV)"
                value={formatILS(data.kpi.avg_order_value)}
                subtitle="סכום ממוצע לכל הזמנה"
              />
              <KpiCard
                icon={<Users className="h-5 w-5" />}
                title="לקוחות"
                value={`${data.kpi.new_customers_count} חדשים · ${data.kpi.returning_customers_count} חוזרים`}
                subtitle="מתחילת השבוע"
              />
              <KpiCard
                icon={<CircleDollarSign className="h-5 w-5" />}
                title="עלות סחורות"
                value={formatILS(data.kpi.total_cost)}
                subtitle="עלות עלות לספקים"
              />
              <KpiCard
                icon={<TrendingUp className="h-5 w-5" />}
                title="רווח גולמי"
                value={formatILS(data.kpi.gross_profit)}
                subtitle={`מרווח ${data.kpi.orders_count > 0 ? Math.round((data.kpi.gross_profit / data.kpi.total_revenue) * 100) : 0}% מההכנסות`}
                delta={percentChange(
                  data.kpi.gross_profit,
                  data.previousKpi.gross_profit,
                )}
              />
              <KpiCard
                icon={<TrendingDown className="h-5 w-5" />}
                title="הפסדים (ביטולים)"
                value={formatILS(data.kpi.cancelled_orders_value)}
                subtitle={`${data.kpi.cancelled_orders_count} הזמנות שבוטלו`}
              />
            </section>

            {/* Fulfillment + Member ratio */}
            <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <RatioCard
                title="איסוף עצמי מול משלוח"
                segments={[
                  {
                    label: "איסוף עצמי",
                    icon: <StoreIcon className="h-4 w-4" />,
                    value: data.fulfillment.pickup,
                    percent: data.fulfillment.pickupPercent,
                  },
                  {
                    label: "משלוח עד הבית",
                    icon: <Truck className="h-4 w-4" />,
                    value: data.fulfillment.delivery,
                    percent: data.fulfillment.deliveryPercent,
                  },
                ]}
              />
              <RatioCard
                title={`לקוחות קבועים (מעל ${data.threshold} הזמנות)`}
                segments={[
                  {
                    label: "לקוח קבוע",
                    icon: <Sparkles className="h-4 w-4 text-gold" />,
                    value: data.memberRatio.members,
                    percent: data.memberRatio.percent,
                  },
                  {
                    label: "לקוח רגיל",
                    icon: <Users className="h-4 w-4" />,
                    value: Math.max(
                      data.memberRatio.total - data.memberRatio.members,
                      0,
                    ),
                    percent: Math.max(100 - data.memberRatio.percent, 0),
                  },
                ]}
              />
            </section>

            {/* Top products */}
            <section className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-lg font-bold">
                  <Package className="h-5 w-5 text-primary" />
                  זרים מובילים בשבוע
                </h2>
                <span className="text-xs text-muted-foreground">
                  לפי יחידות שנמכרו
                </span>
              </div>
              {data.topProducts.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  אין נתונים להצגה.
                </p>
              ) : (
                <Table
                  headers={["#", "מוצר", "יחידות", "הכנסה", "עלות", "רווח"]}
                  rows={data.topProducts.map((p, idx) => [
                    String(idx + 1),
                    p.title,
                    `${p.units} יח׳`,
                    formatILS(p.revenue),
                    formatILS(p.cost),
                    formatILS(p.profit),
                  ])}
                />
              )}
            </section>

            {/* Supplier aggregation */}
            <section className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-lg font-bold">
                  <Percent className="h-5 w-5 text-primary" />
                  סיכום הזמנה מספקים
                </h2>
                <span className="text-xs text-muted-foreground">
                  כמויות להזמנה מהספקים לשבוע הנוכחי
                </span>
              </div>
              {data.suppliers.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  אין נתונים להצגה.
                </p>
              ) : (
                <Table
                  headers={["#", "זר", "כמות להזמנה"]}
                  rows={data.suppliers.map((p, idx) => [
                    String(idx + 1),
                    p.title,
                    `${p.units} יחידות`,
                  ])}
                />
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function formatDateRange(a: string, b: string) {
  const f = (s: string) =>
    new Date(s).toLocaleDateString("he-IL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  return `${f(a)} – ${f(b)}`;
}

function percentChange(current: number, prev: number): number | null {
  if (!prev) return null;
  return Math.round(((current - prev) / prev) * 100);
}

function KpiCard({
  icon,
  title,
  value,
  subtitle,
  delta,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  subtitle?: string;
  delta?: number | null;
}) {
  const positive = delta != null && delta >= 0;
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-muted-foreground">
        <span className="rounded-md bg-primary/10 p-1.5 text-primary">{icon}</span>
        <span className="text-xs font-medium">{title}</span>
      </div>
      <div className="brand-serif text-2xl font-bold text-primary">{value}</div>
      {subtitle && (
        <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      )}
      {delta != null && (
        <p
          className={`mt-1 inline-flex items-center gap-0.5 text-xs font-medium ${
            positive ? "text-emerald-600" : "text-rose-600"
          }`}
        >
          {positive ? (
            <ArrowUpRight className="h-3.5 w-3.5" />
          ) : (
            <ArrowDownRight className="h-3.5 w-3.5" />
          )}
          {positive ? "+" : ""}
          {delta}% לעומת שבוע קודם
        </p>
      )}
    </div>
  );
}

function RatioCard({
  title,
  segments,
}: {
  title: string;
  segments: Array<{
    label: string;
    icon: React.ReactNode;
    value: number;
    percent: number;
  }>;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      <div className="space-y-3">
        {segments.map((s) => (
          <div key={s.label}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="inline-flex items-center gap-1.5">
                {s.icon}
                {s.label}
              </span>
              <span className="tabular-nums">
                {s.value} · {s.percent}%
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.max(0, Math.min(100, s.percent))}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Table({
  headers,
  rows,
}: {
  headers: string[];
  rows: Array<Array<string | number>>;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
          <tr>
            {headers.map((h) => (
              <th key={h} className="p-2 text-start font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t">
              {r.map((c, j) => (
                <td
                  key={j}
                  className={`p-2 ${
                    j === headers.length - 1 ? "tabular-nums font-medium" : ""
                  }`}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}