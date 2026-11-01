"use client";

import Link from "next/link";
import { ArrowLeft, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatILS } from "@/lib/utils";
import { ROLE_LABELS, type StaffRole } from "@/lib/staff/access";
import { T } from "@/lib/staff/labels";
import { OT } from "@/lib/staff/owner/labels";
import type { DashboardData, ProductSales } from "@/lib/staff/owner/week-math";
import { Card, EmptyState, Line } from "../shared";

function ProductList({ title, rows, empty }: { title: string; rows: ProductSales[]; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.units));
  return (
    <Card title={title}>
      {rows.length === 0 ? (
        <EmptyState title={empty} />
      ) : (
        <ol className="space-y-2">
          {rows.slice(0, 10).map((r, i) => (
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

export function ProductsTab({ data }: { data: DashboardData }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <ProductList title="הזמנות באתר" rows={data.products.website} empty="עוד אין הזמנות השבוע" />
      <ProductList title="מכירות בדוכנים" rows={data.products.stalls} empty="עוד אין מכירות בדוכנים השבוע" />
    </div>
  );
}

export function StallsTab({ data }: { data: DashboardData }) {
  if (data.stalls.length === 0) {
    return <EmptyState title="אין דוכנים פעילים" hint="מוסיפים דוכנים במסך הדוכנים." />;
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {data.stalls.map((s) => (
        <Card
          key={s.id}
          title={s.name}
          actions={
            <span className={s.is_open ? "text-sm font-medium text-emerald-700" : "text-sm text-muted-foreground"}>
              {s.is_open ? "פתוח עכשיו" : "סגור"}
            </span>
          }
        >
          {s.location && <p className="-mt-2 mb-2 text-xs text-muted-foreground">{s.location}</p>}
          <Line label={`מכירות השבוע (${s.sales.count})`} value={formatILS(s.sales.revenue)} />
          <Line label={T.bit} value={formatILS(s.sales.bit)} />
          <Line label={T.cash} value={formatILS(s.sales.cash)} />
          {s.sales.other > 0 && <Line label="אחר" value={formatILS(s.sales.other)} />}
          <Line label="מלאי שנשאר" value={`${s.stock.remaining} מתוך ${s.stock.initial}`} strong />
          {s.stock.products.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              {s.stock.products.map((p) => (
                <li key={p.product_id} className="flex justify-between gap-2">
                  <span className="truncate">{p.title}</span>
                  <span className="tabular-nums">
                    {p.stock}/{p.initial}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 border-t pt-2 text-sm">
            <div className="mb-1 font-medium">משובצים לשישי</div>
            {s.workersToday.length === 0 ? (
              <p className="text-muted-foreground">עוד לא שובצו מוכרים לשישי</p>
            ) : (
              <ul className="space-y-0.5">
                {s.workersToday.map((w, i) => (
                  <li key={`${w.employee_id}-${i}`} className="flex justify-between gap-2">
                    <span>{w.full_name}</span>
                    <span className="tabular-nums text-muted-foreground" dir="ltr">
                      {w.start_time}–{w.end_time}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}

export function TeamTab({ data }: { data: DashboardData }) {
  if (data.team.length === 0) {
    return <EmptyState title="אין משמרות השבוע" hint="משבצים עובדים במסך שיבוץ המשמרות." />;
  }
  return (
    <Card
      title="מי עובד השבוע"
      actions={
        <span className="text-sm text-muted-foreground">
          סה״כ לפי השיבוץ: <b className="text-foreground">{formatILS(data.payroll.scheduled)}</b>
        </span>
      }
    >
      <ul className="divide-y md:hidden">
        {data.team.map((t) => (
          <li key={t.employee_id || `${t.role}-${t.full_name}`} className="py-2 text-sm">
            <div className="flex justify-between gap-2 font-medium">
              <span>{t.full_name}</span>
              <span className="tabular-nums">{t.role === "owner" ? "—" : formatILS(t.amount)}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {ROLE_LABELS[t.role as StaffRole] ?? t.role} · {t.shifts} משמרות · {t.hours} שעות
              {t.deliveries > 0 && ` · ${t.deliveries} משלוחים`}
            </div>
          </li>
        ))}
      </ul>
      <table className="hidden w-full text-sm md:table">
        <thead className="text-muted-foreground">
          <tr className="border-b text-start">
            <th className="py-2 text-start font-medium">עובד</th>
            <th className="py-2 text-start font-medium">משמרות</th>
            <th className="py-2 text-start font-medium">שעות</th>
            <th className="py-2 text-start font-medium">משלוחים</th>
            <th className="py-2 text-start font-medium">עד עכשיו</th>
            <th className="py-2 text-start font-medium">כל השבוע</th>
          </tr>
        </thead>
        <tbody>
          {data.team.map((t) => (
            <tr key={t.employee_id || `${t.role}-${t.full_name}`} className="border-b last:border-0">
              <td className="py-2">
                {t.full_name}
                {t.role === "owner" && <span className="ms-1 text-xs text-muted-foreground">(ללא שכר)</span>}
              </td>
              <td className="py-2 tabular-nums">{t.shifts}</td>
              <td className="py-2 tabular-nums">{t.hours}</td>
              <td className="py-2 tabular-nums">{t.deliveries}</td>
              <td className="py-2 tabular-nums">{formatILS(t.amountSoFar)}</td>
              <td className="py-2 tabular-nums font-medium">{formatILS(t.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export function MoneyTab({ data }: { data: DashboardData }) {
  const f = data.finance;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title={T.revenue}>
        <Line label={OT.money.preorder} value={formatILS(f.revenue.preorder)} />
        <Line label={OT.money.live} value={formatILS(f.revenue.live)} />
        {f.revenue.manual > 0 && <Line label={OT.money.manual} value={formatILS(f.revenue.manual)} />}
        <Line label={T.stalls} value={formatILS(f.revenue.stalls)} />
        <Line label={`סה״כ ${T.revenue}`} value={formatILS(f.revenue.total)} strong />
      </Card>
      <Card title="עלויות">
        <Line
          label={
            <span>
              {OT.kpi.supplierCost}
              <span className="block text-xs">{f.supplierCostBasis === "order" ? OT.money.basisOrder : OT.money.basisSold}</span>
            </span>
          }
          value={formatILS(f.supplierCost)}
          negative
        />
        <Line label={OT.money.recurring} value={formatILS(f.expenses.recurring)} negative />
        <Line label={OT.money.oneTime} value={formatILS(f.expenses.oneTime)} negative />
        <Line
          label={
            <span>
              {OT.kpi.payroll}
              <span className="block text-xs">לפי השיבוץ, לא חלק מההוצאות</span>
            </span>
          }
          value={formatILS(data.payroll.soFar)}
          negative
        />
        <Line label={OT.kpi.net} value={formatILS(f.netProfit)} strong negative={f.netProfit < 0} />
        <div className="mt-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/staff/money">
              לעמוד כסף
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}

export function SupplierTab({ data }: { data: DashboardData }) {
  return (
    <Card>
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Truck className="mt-0.5 h-6 w-6 text-primary" />
          <div>
            <div className="font-medium">
              {data.week.supplierOrderedAt ? OT.dashboard.supplierSent : OT.dashboard.supplierNotSent}
            </div>
            <p className="text-sm text-muted-foreground">
              כמה להזמין מכל זר, הודעת וואטסאפ לספק, וקביעת המלאי לבלייב.
            </p>
          </div>
        </div>
        <Button asChild size="lg" className="w-full sm:w-auto">
          <Link href="/staff/supplier">
            להזמנה מהספק
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </Card>
  );
}
