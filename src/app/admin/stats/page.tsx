"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ExternalLink,
  Loader2,
  LogOut,
  RefreshCw,
  DollarSign,
  Receipt,
  Target,
  Users,
  ShoppingBag,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  clearAdminAuth,
  isAdminAuthenticated,
} from "@/components/AdminGate";
import { AdminNav } from "@/components/AdminNav";
import { formatILS } from "@/lib/utils";
import type {
  StatsPayloadExtended,
  AllTimeMetrics,
  BestSeller,
  SellThrough,
  CustomerSegments,
} from "@/types";

function parseMetric(value: unknown, field: string) {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && value.trim() === "")
  ) {
    throw new Error(`Invalid stats response: ${field} is ${String(value)}`);
  }

  const metric = Number(value);
  if (!Number.isFinite(metric)) {
    throw new Error(`Invalid stats response: ${field} is ${String(value)}`);
  }

  return metric;
}

function parseStatsPayload(payload: unknown): StatsPayloadExtended {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid stats response: expected a JSON object");
  }

  const source = payload as Partial<StatsPayloadExtended> & {
    allTimeMetrics?: Partial<AllTimeMetrics>;
  };
  if (!source.allTimeMetrics) {
    throw new Error("Invalid stats response: missing allTimeMetrics");
  }

  return {
    ...source,
    allTimeMetrics: {
      cumulative_gross_profit: parseMetric(
        source.allTimeMetrics.cumulative_gross_profit,
        "cumulative_gross_profit",
      ),
      total_expenses: parseMetric(
        source.allTimeMetrics.total_expenses,
        "total_expenses",
      ),
      true_net_profit: parseMetric(
        source.allTimeMetrics.true_net_profit,
        "true_net_profit",
      ),
    },
  } as StatsPayloadExtended;
}

export default function AdminStatsPage() {
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<StatsPayloadExtended | null>(null);
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
      const res = await fetch("/api/admin/stats", {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        const error = new Error(
          `Stats request failed (${res.status}): ${body || res.statusText}`,
        );
        console.error("Admin stats fetch failed:", error);
        throw error;
      }

      let payload: unknown;
      try {
        payload = await res.json();
      } catch (e) {
        console.error("Admin stats response parsing failed:", e);
        throw e;
      }

      setData(parseStatsPayload(payload));
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      console.error("Admin stats load failed:", error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    clearAdminAuth();
    window.location.replace("/admin");
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
            <Button asChild size="sm" variant="outline">
              <Link href="/stall" target="_blank">
                <ExternalLink className="h-4 w-4" />
                דוכן
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
            {/* All-Time Financial Summary Cards */}
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <KpiCard
                icon={<DollarSign className="h-5 w-5 text-emerald-600" />}
                title="רווח גולמי מצטבר (כל הזמנים)"
                value={formatILS(data.allTimeMetrics.cumulative_gross_profit)}
                subtitle="סכום רווח גולמי מכל הסבבים + שבוע נוכחי"
              />
              <KpiCard
                icon={<Receipt className="h-5 w-5 text-rose-600" />}
                title="סך כל ההוצאות"
                value={formatILS(data.allTimeMetrics.total_expenses)}
                subtitle="חד-פעמיות וקבועות"
              />
              <KpiCard
                icon={<Target className="h-5 w-5 text-primary" />}
                title="רווח נקי אמיתי (כל הזמנים)"
                value={formatILS(data.allTimeMetrics.true_net_profit)}
                subtitle="רווח גולמי מצטבר פחות סך הוצאות"
                delta={data.allTimeMetrics.true_net_profit >= 0 ? 100 : -100}
              />
            </section>

            {/* Split Top Sellers (Pre-Orders vs Stall Sales) */}
            <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <BestSellerCard
                title="הנמכר ביותר (הזמנות מראש)"
                subtitle="מאתר האינטרנט לבד"
                icon={<ShoppingBag className="h-5 w-5 text-amber-600" />}
                data={data.bestSellerPreorders}
              />
              <BestSellerCard
                title="הנמכר ביותר (מכירה בדוכן)"
                subtitle="מהדוכן בלבד"
                icon={<Package className="h-5 w-5 text-emerald-600" />}
                data={data.bestSellerStallSales}
              />
            </section>

            {/* Stall-Exclusive Sell-Through Rate */}
            <SellThroughCard data={data.highestSellThrough} />

            {/* Fast Customer Metrics */}
            <CustomerSegmentsCard data={data.customerSegments} />
          </>
        )}
      </div>
    </main>
  );
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
          className={`mt-1 text-xs font-medium ${
            positive ? "text-emerald-600" : "text-rose-600"
          }`}
        >
          {positive ? "+" : ""}
          {delta}%
        </p>
      )}
    </div>
  );
}

function BestSellerCard({
  title,
  subtitle,
  icon,
  data,
}: {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  data: BestSeller | null;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className="rounded-md bg-primary/10 p-1.5 text-primary">{icon}</span>
        <h2 className="flex items-center gap-2 text-lg font-bold">
          {title}
        </h2>
      </div>
      {data ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-amber-100 p-3 text-amber-700 text-2xl font-bold">
              #1
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate">{data.title}</p>
              <p className="text-sm text-muted-foreground">
                {(data.total_units || 0)} יחידות סה״ם
              </p>
              {subtitle && (
                <p className="text-xs text-muted-foreground">{subtitle}</p>
              )}
            </div>
            <div className="text-right">
              <p className="font-bold text-primary">
                {formatILS(data.total_revenue || 0)}
              </p>
              <p className="text-sm text-emerald-600">
                רווח: {formatILS(data.total_profit || 0)}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <p className="py-4 text-center text-sm text-muted-foreground">אין נתונים</p>
      )}
    </div>
  );
}

function SellThroughCard({ data }: { data: SellThrough | null }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-muted-foreground">
        <span className="rounded-md bg-primary/10 p-1.5 text-primary">
          <Package className="h-5 w-5 text-emerald-600" />
        </span>
        <span className="text-xs font-medium">ניצול מלאי מיטבי (מכירה בדוכן בלבד)</span>
      </div>
      {data ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-emerald-100 p-3 text-emerald-700 text-2xl font-bold">
              %
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate">{data.title}</p>
              <p className="text-sm text-muted-foreground">
                נמכרו {(data.total_sold || 0)} מתוך {(data.initial_stock || 0)} יחידות
              </p>
            </div>
            <div className="text-right">
              <p className="brand-serif text-2xl font-bold text-emerald-600">
                {(data.sell_through_pct || 0).toFixed(2)}%
              </p>
              <p className="text-xs text-muted-foreground">שיעור ניצול מלאי</p>
            </div>
          </div>
        </div>
      ) : (
        <p className="py-4 text-center text-sm text-muted-foreground">
          אין נתונים (נדרש מלאי התחלתי במוצרים)
        </p>
      )}
    </div>
  );
}

function CustomerSegmentsCard({ data }: { data: CustomerSegments }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-muted-foreground">
        <span className="rounded-md bg-primary/10 p-1.5 text-primary">
          <Users className="h-5 w-5" />
        </span>
        <span className="text-xs font-medium">קהל לקוחות (כל ההזמנות)</span>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="text-center">
          <div className="brand-serif text-3xl font-bold text-primary">
            {(data?.regular_customers || 0).toString()}
          </div>
          <p className="text-sm text-muted-foreground">לקוחות רגילים (1–3 הזמנות)</p>
        </div>
        <div className="text-center">
          <div className="brand-serif text-3xl font-bold text-gold">
            {(data?.loyal_customers || 0).toString()}
          </div>
          <p className="text-sm text-muted-foreground">לקוחות קבועים (&gt;3 הזמנות)</p>
        </div>
      </div>
    </div>
  );
}
