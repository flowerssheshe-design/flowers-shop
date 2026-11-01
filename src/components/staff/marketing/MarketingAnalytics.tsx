"use client";

import { useStaffRefresh } from "@/lib/staff/refresh";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { AnalyticsResult } from "@/lib/staff/marketing/analytics";
import { Card, EmptyState, ErrorState, Loading, StatCard, api, fieldClass, formatDate } from "./ui";

type Period = "week" | "4weeks" | "custom";

const PERIODS: { key: Period; label: string }[] = [
  { key: "week", label: "השבוע" },
  { key: "4weeks", label: "4 שבועות אחרונים" },
  { key: "custom", label: "טווח אחר" },
];

function Bar({ value, max, className }: { value: number; max: number; className?: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2 w-full rounded-full bg-muted" aria-hidden="true">
      <div className={`h-2 rounded-full ${className ?? "bg-primary"}`} style={{ width: `${value > 0 ? pct : 0}%` }} />
    </div>
  );
}

export function MarketingAnalytics() {
  const [period, setPeriod] = useState<Period>("4weeks");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<AnalyticsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (period === "custom" && (!from || !to)) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ period });
      if (period === "custom") {
        qs.set("from", from);
        qs.set("to", to);
      }
      setData(await api<AnalyticsResult>(`/api/staff/marketing/analytics?${qs}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [period, from, to]);

  useEffect(() => {
    if (period !== "custom") void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);
  useStaffRefresh(load);

  const maxWeek = data ? Math.max(1, ...data.weeks.map((w) => w.visits)) : 1;
  const maxSource = data ? Math.max(1, ...data.sources.map((s) => s.visits)) : 1;
  const maxProduct = data?.topProducts[0]?.qty ?? 1;
  const customersTotal = data ? data.customers.new + data.customers.returning : 0;

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="תקופה">
          {PERIODS.map((p) => (
            <Button
              key={p.key}
              role="radio"
              aria-checked={period === p.key}
              variant={period === p.key ? "default" : "outline"}
              className="min-h-11"
              onClick={() => setPeriod(p.key)}
            >
              {p.label}
            </Button>
          ))}
        </div>
        {period === "custom" && (
          <form
            className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              void load();
            }}
          >
            <div>
              <Label htmlFor="from">מתאריך</Label>
              <input id="from" type="date" className={fieldClass} value={from} onChange={(e) => setFrom(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="to">עד תאריך</Label>
              <input id="to" type="date" className={fieldClass} value={to} onChange={(e) => setTo(e.target.value)} required />
            </div>
            <Button type="submit" className="min-h-11">
              הצגה
            </Button>
          </form>
        )}
      </Card>

      {loading && period !== "custom" && !data ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !data ? (
        period === "custom" ? <EmptyState title="בחרו טווח תאריכים ולחצו על הצגה" /> : <Loading />
      ) : (
        <div className={loading ? "space-y-6 opacity-60" : "space-y-6"}>
          <p className="text-sm text-muted-foreground">
            {formatDate(data.from)} – {formatDate(data.to)}
          </p>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="ביקורים באתר" value={data.totals.visits} hint="כניסות שונות (לא כולל צוות)" />
            <StatCard label="משתמשים חדשים" value={data.totals.newUsers} hint="נרשמו לאתר" />
            <StatCard label="הזמנות באתר" value={data.totals.orders} hint="לא כולל דוכן ומבוטלות" />
            <StatCard
              label="המרה להזמנה"
              value={data.totals.conversionPct === null ? "—" : `${data.totals.conversionPct}%`}
              hint="הזמנות מתוך ביקורים"
            />
          </div>

          <Card>
            <h2 className="mb-3 text-lg font-bold">לפי שבוע</h2>
            {data.weeks.length === 0 ? (
              <EmptyState title="אין נתונים בטווח הזה" />
            ) : (
              <>
                <ul className="space-y-4 md:hidden">
                  {data.weeks.map((w) => (
                    <li key={w.weekStart} className="space-y-1">
                      <p className="text-sm font-medium">שבוע מ-{formatDate(w.weekStart)}</p>
                      <Bar value={w.visits} max={maxWeek} />
                      <p className="text-xs text-muted-foreground">
                        {w.visits} ביקורים · {w.newUsers} נרשמו · {w.orders} הזמנות
                      </p>
                    </li>
                  ))}
                </ul>
                <table className="hidden w-full text-sm md:table">
                  <thead className="text-right text-muted-foreground">
                    <tr>
                      <th className="py-2 font-medium">שבוע מ-</th>
                      <th className="py-2 font-medium">ביקורים</th>
                      <th className="w-1/3 py-2" aria-hidden="true" />
                      <th className="py-2 font-medium">נרשמו</th>
                      <th className="py-2 font-medium">הזמנות</th>
                      <th className="py-2 font-medium">המרה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.weeks.map((w) => (
                      <tr key={w.weekStart} className="border-t">
                        <td className="py-2">{formatDate(w.weekStart)}</td>
                        <td className="py-2 tabular-nums">{w.visits}</td>
                        <td className="py-2">
                          <Bar value={w.visits} max={maxWeek} />
                        </td>
                        <td className="py-2 tabular-nums">{w.newUsers}</td>
                        <td className="py-2 tabular-nums">{w.orders}</td>
                        <td className="py-2 tabular-nums">
                          {w.visits > 0 ? `${Math.round((w.orders / w.visits) * 1000) / 10}%` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <h2 className="mb-1 text-lg font-bold">מאיפה הגיעו</h2>
              <p className="mb-3 text-xs text-muted-foreground">לפי קישורי מעקב. &quot;ישיר&quot; = בלי קישור.</p>
              {data.sources.length === 0 ? (
                <EmptyState title="אין עדיין ביקורים או הזמנות בטווח" />
              ) : (
                <ul className="space-y-3">
                  {data.sources.map((s) => (
                    <li key={s.linkId ?? "direct"} className="space-y-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-medium">{s.name}</span>
                        <span className="shrink-0 text-sm tabular-nums">{s.orders} הזמנות</span>
                      </div>
                      <Bar value={s.visits} max={maxSource} className="bg-gold" />
                      <p className="text-xs text-muted-foreground">
                        {s.visits} ביקורים · {s.signups} נרשמו
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <h2 className="mb-3 text-lg font-bold">לקוחות חדשים מול חוזרים</h2>
              {customersTotal === 0 ? (
                <EmptyState title="אין הזמנות בטווח" />
              ) : (
                <>
                  <div className="flex h-4 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
                    <div className="bg-primary" style={{ width: `${(data.customers.new / customersTotal) * 100}%` }} />
                    <div className="bg-gold" style={{ width: `${(data.customers.returning / customersTotal) * 100}%` }} />
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="flex items-center gap-2 text-muted-foreground">
                        <span className="inline-block h-3 w-3 rounded-full bg-primary" /> הזמנה ראשונה
                      </dt>
                      <dd className="text-xl font-bold tabular-nums">{data.customers.new}</dd>
                    </div>
                    <div>
                      <dt className="flex items-center gap-2 text-muted-foreground">
                        <span className="inline-block h-3 w-3 rounded-full bg-gold" /> חוזרים
                      </dt>
                      <dd className="text-xl font-bold tabular-nums">{data.customers.returning}</dd>
                    </div>
                  </dl>
                </>
              )}
            </Card>
          </div>

          <Card>
            <h2 className="mb-3 text-lg font-bold">הזרים שהוזמנו הכי הרבה באתר</h2>
            {data.topProducts.length === 0 ? (
              <EmptyState title="אין הזמנות בטווח" />
            ) : (
              <ol className="space-y-3">
                {data.topProducts.map((p, i) => (
                  <li key={p.title} className="space-y-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate">
                        {i + 1}. {p.title}
                      </span>
                      <span className="shrink-0 text-sm tabular-nums">{p.qty}</span>
                    </div>
                    <Bar value={p.qty} max={maxProduct} />
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
