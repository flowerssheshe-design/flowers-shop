"use client";

import { cn, formatILS } from "@/lib/utils";
import { T } from "@/lib/staff/labels";
import type { MoneyTotals, MoneyWeek, PaymentSplit } from "@/lib/staff/owner/money";
import type { ProductSales } from "@/lib/staff/owner/week-math";
import { Card, EmptyState, Line, fmtDate, fmtWeek } from "../shared";

const MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return m >= 1 && m <= 12 ? `${MONTHS[m - 1]} ${y}` : key;
}

function netClass(n: number) {
  return n < 0 ? "text-rose-700" : "text-emerald-700";
}

/** Money received, split by Bit / cash / PayBox, plus what is still waiting for payment. */
export function PaymentsCard({ title, split }: { title: string; split: PaymentSplit }) {
  return (
    <Card title={title}>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-muted/50 p-2">
          <div className="text-xs text-muted-foreground">{T.bit}</div>
          <div className="text-lg font-bold tabular-nums">{formatILS(split.bit)}</div>
        </div>
        <div className="rounded-lg bg-muted/50 p-2">
          <div className="text-xs text-muted-foreground">{T.cash}</div>
          <div className="text-lg font-bold tabular-nums">{formatILS(split.cash)}</div>
        </div>
        <div className="rounded-lg bg-muted/50 p-2">
          <div className="text-xs text-muted-foreground">{T.paybox}</div>
          <div className="text-lg font-bold tabular-nums">{formatILS(split.paybox)}</div>
        </div>
      </div>
      <div className="mt-2">
        {split.other > 0 && <Line label="בלי אמצעי תשלום רשום" value={formatILS(split.other)} />}
        <Line label={`סה״כ שולם (${split.count} הזמנות ומכירות)`} value={formatILS(split.total)} strong />
        {split.pending.count > 0 && (
          <p className="mt-2 rounded-md bg-amber-50 p-2 text-sm text-amber-800">
            ממתין לתשלום: {formatILS(split.pending.amount)} ({split.pending.count} הזמנות). עוד לא נספר כאן.
          </p>
        )}
      </div>
    </Card>
  );
}

/** Revenue → supplier → expenses → payroll → net, for a set of weeks. */
export function TotalsCard({ title, totals, note }: { title: string; totals: MoneyTotals; note?: string }) {
  return (
    <Card title={title}>
      <Line label={`${T.revenue} מהאתר`} value={formatILS(totals.revenue.website)} />
      <Line label={`${T.revenue} מהדוכנים`} value={formatILS(totals.revenue.stalls)} />
      <Line label={`סה״כ ${T.revenue}`} value={formatILS(totals.revenue.total)} strong />
      <Line label="עלות ספק" value={formatILS(totals.supplierCost)} negative />
      <Line label="הוצאות כלליות" value={formatILS(totals.expenses)} negative />
      <Line label={T.payroll} value={formatILS(totals.payroll)} negative />
      <div className={cn("flex items-center justify-between gap-3 border-t pt-2 text-base font-bold")}>
        <span>{T.netProfit}</span>
        <span className={cn("tabular-nums", netClass(totals.net))}>{formatILS(totals.net)}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        <span>
          {totals.ordersCount} הזמנות ({totals.websiteOrdersCount} באתר · {totals.stallSalesCount} בדוכנים)
        </span>
        <span>ממוצע להזמנה {formatILS(totals.avgOrder)}</span>
        <span>
          {totals.weeks} שבועות · הכנסה ממוצעת לשבוע {formatILS(totals.avgRevenuePerWeek)}
        </span>
        <span>רווח נקי ממוצע לשבוע {formatILS(totals.avgNetPerWeek)}</span>
      </div>
      {note && <p className="mt-2 text-xs text-muted-foreground">{note}</p>}
    </Card>
  );
}

export function BestSellers({ title, rows, empty }: { title: string; rows: ProductSales[]; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.units));
  return (
    <Card title={title}>
      {rows.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ol className="space-y-2">
          {rows.map((r, i) => (
            <li key={r.product_id}>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">
                  <span className="text-muted-foreground">{i + 1}. </span>
                  {r.title}
                </span>
                <span className="shrink-0 tabular-nums">
                  {r.units} יח׳ · {formatILS(r.revenue)}
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-muted">
                <div className="h-1.5 rounded-full bg-primary" style={{ width: `${(r.units / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function weekStatus(w: MoneyWeek): string {
  if (w.isCurrent) return "השבוע (עד עכשיו)";
  return w.closed ? "נסגר" : "עוד לא נסגר";
}

/** One row per week: cards on phones, a table from md up. */
export function WeeksSummary({ weeks }: { weeks: MoneyWeek[] }) {
  if (weeks.length === 0) return <EmptyState title="אין נתונים עדיין" />;
  return (
    <>
      <ul className="space-y-2 md:hidden">
        {weeks.map((w) => {
          const f = w.finance;
          return (
            <li key={w.weekStart} className="rounded-xl border bg-card p-3 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <span>
                  <span className="block font-medium">{fmtWeek(w.weekStart, w.weekEnd)}</span>
                  <span className="text-xs text-muted-foreground">{weekStatus(w)}</span>
                </span>
                <span className={cn("text-lg font-bold tabular-nums", netClass(f.netProfit))}>{formatILS(f.netProfit)}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                <span>הכנסות {formatILS(f.revenue.total)}</span>
                <span>ספק {formatILS(f.supplierCost)}</span>
                <span>הוצאות {formatILS(f.expenses.total)}</span>
                <span>שכר {formatILS(f.payroll)}</span>
              </div>
            </li>
          );
        })}
      </ul>
      <Card className="hidden md:block">
        <table className="w-full text-sm">
          <thead className="text-muted-foreground">
            <tr className="border-b">
              <th className="py-2 text-start font-medium">שבוע</th>
              <th className="py-2 text-start font-medium">הכנסות</th>
              <th className="py-2 text-start font-medium">ספק</th>
              <th className="py-2 text-start font-medium">הוצאות</th>
              <th className="py-2 text-start font-medium">שכר</th>
              <th className="py-2 text-start font-medium">רווח נקי</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((w) => {
              const f = w.finance;
              return (
                <tr key={w.weekStart} className="border-b last:border-0">
                  <td className="py-2">
                    {fmtWeek(w.weekStart, w.weekEnd)}
                    <span className="block text-xs text-muted-foreground">{weekStatus(w)}</span>
                  </td>
                  <td className="py-2 tabular-nums">
                    {formatILS(f.revenue.total)}
                    <span className="block text-xs text-muted-foreground">
                      אתר {formatILS(f.revenue.website)} · דוכנים {formatILS(f.revenue.stalls)}
                    </span>
                  </td>
                  <td className="py-2 tabular-nums">{formatILS(f.supplierCost)}</td>
                  <td className="py-2 tabular-nums">{formatILS(f.expenses.total)}</td>
                  <td className="py-2 tabular-nums">{formatILS(f.payroll)}</td>
                  <td className={cn("py-2 font-bold tabular-nums", netClass(f.netProfit))}>{formatILS(f.netProfit)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}

export function sinceLabel(since: string | null): string {
  return since ? `מאז ההתחלה (${fmtDate(since, true)})` : "מאז ההתחלה";
}
