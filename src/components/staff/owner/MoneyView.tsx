"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Receipt, ShoppingBag, Truck, Users, Wallet } from "lucide-react";
import { StaffPageHeader } from "@/components/staff/StaffShell";
import { formatILS } from "@/lib/utils";
import { T } from "@/lib/staff/labels";
import type { MoneyOverview } from "@/lib/staff/owner/money";
import { ErrorState, Kpi, LoadingState, RefreshButton, fmtWeek, useStaffJson } from "./shared";
import { BestSellers, PaymentsCard, TotalsCard, WeeksSummary, monthLabel, sinceLabel } from "./money/MoneyParts";

type Data = MoneyOverview & { generatedAt: string };

export function MoneyView() {
  const [count, setCount] = useState(12);
  const { data, error, loading, reload } = useStaffJson<Data>(`/api/staff/money?weeks=${count}`);
  const cur = data?.current;
  const f = cur?.finance;

  return (
    <div>
      <StaffPageHeader refresh={false}
        title="כסף"
        description="כמה כסף נכנס, כמה יצא, וכמה נשאר נקי"
        actions={<RefreshButton onClick={() => void reload()} loading={loading} />}
      />

      {error && !data && <ErrorState message={error} onRetry={() => void reload()} />}
      {loading && !data && <LoadingState />}

      {data && (
        <div className="space-y-8">
          {error && <p className="text-sm text-destructive">{error}</p>}

          {cur && f && (
            <section>
              <h2 className="mb-3 text-lg font-bold">
                השבוע · {fmtWeek(cur.weekStart, cur.weekEnd)}
              </h2>
              {/* Revenue − costs = the week's balance. Pay counts the whole week (it's committed). */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Kpi
                  icon={<ShoppingBag className="h-4 w-4" />}
                  label={T.revenue}
                  value={formatILS(f.revenue.total)}
                  sub={`אתר ${formatILS(f.revenue.website)} · דוכנים ${formatILS(f.revenue.stalls)}`}
                />
                <Kpi
                  icon={<Receipt className="h-4 w-4" />}
                  label="עלויות השבוע"
                  value={formatILS(f.supplierCost + f.expenses.total + f.payroll)}
                  sub={`ספק ${formatILS(f.supplierCost)} · הוצאות ${formatILS(f.expenses.total)} · שכר ${formatILS(f.payroll)}`}
                />
                <Kpi
                  icon={<Wallet className="h-4 w-4" />}
                  label="יתרה השבוע (נקי)"
                  value={formatILS(f.netProfit)}
                  tone={f.netProfit >= 0 ? "good" : "bad"}
                  sub={f.netProfit >= 0 ? "הכנסות פחות כל העלויות" : "במינוס: העלויות גבוהות מההכנסות"}
                />
              </div>
              <div className="mt-4">
                <PaymentsCard title="איפה הכסף של השבוע (מה ששולם)" split={data.payments.week} />
              </div>
            </section>
          )}

          <section className="grid gap-4 md:grid-cols-2">
            <TotalsCard title={`החודש · ${monthLabel(data.thisMonth.month)}`} totals={data.thisMonth} note="שבוע נספר בחודש שבו הוא מתחיל (יום ראשון)." />
            <TotalsCard title={sinceLabel(data.allTime.since)} totals={data.allTime} />
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold">הזרים שנמכרו הכי הרבה (מאז ההתחלה)</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <BestSellers title="בהזמנות מהאתר" rows={data.bestSellers.website} empty="עוד אין הזמנות" />
              <BestSellers title="בדוכנים" rows={data.bestSellers.stalls} empty="עוד אין מכירות בדוכנים" />
            </div>
          </section>

          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-bold">סיכום לפי שבועות</h2>
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">כמה שבועות</span>
                <select
                  className="h-10 rounded-md border bg-background px-2"
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                >
                  {[8, 12, 26].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <WeeksSummary weeks={data.recent} />
          </section>

          <div className="flex flex-wrap gap-3 text-sm">
            <Link href="/staff/expenses" className="inline-flex items-center gap-1 text-primary underline">
              לפירוט ההוצאות
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <Link href="/staff/payroll" className="inline-flex items-center gap-1 text-primary underline">
              לפירוט השכר
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
