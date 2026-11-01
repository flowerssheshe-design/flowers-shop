"use client";

import { Card, EmptyState, Kpi, fmtDate, fmtWeek } from "@/components/staff/owner/shared";
import { addDays } from "@/lib/staff/week";
import { formatILS } from "@/lib/utils";
import type { PaySummaryPerson, PayrollResponse } from "@/lib/staff/owner/pay-summary";
import { P } from "./labels";

function personName(p: PaySummaryPerson): string {
  if (p.kind === "budget") return P.budgetRemainder;
  return p.full_name;
}

export function SummarySection({ data }: { data: PayrollResponse }) {
  const s = data.summary;
  const maxWeek = Math.max(1, ...s.weeks.map((w) => w.total));

  return (
    <div className="space-y-4">
      <Kpi label={P.grandTotal} value={formatILS(s.grandTotal)} sub={P.grandTotalHint} />

      <Card title={P.byWeek}>
        <ul className="space-y-2">
          {s.weeks.map((w) => (
            <li key={w.weekStart} className="text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className={w.isCurrent ? "font-medium" : "text-muted-foreground"}>
                  {w.isCurrent ? `${P.thisWeekSoFar} · ` : ""}
                  {fmtWeek(w.weekStart, addDays(w.weekStart, 6))}
                </span>
                <span className="font-medium tabular-nums">{formatILS(w.total)}</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-muted" aria-hidden="true">
                <div className="h-2 rounded-full bg-primary" style={{ width: `${(w.total / maxWeek) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card title={P.byPerson}>
        {s.people.length === 0 ? (
          <EmptyState title={P.noPayYet} />
        ) : (
          <ul className="divide-y">
            {s.people.map((p) => {
              const weeks = Object.entries(p.byWeek).sort((a, b) => b[0].localeCompare(a[0]));
              return (
                <li key={p.key} className="py-2">
                  <details>
                    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm">
                      <span className="min-w-0">
                        <span className="font-medium">{personName(p)}</span>
                        {p.kind === "entry" && <span className="ms-1 text-xs text-muted-foreground">({P.migrated})</span>}
                        <span className="block text-xs text-muted-foreground">
                          {weeks.length} {P.weeksCount}
                          {p.fromEntries > 0 && p.kind === "employee" && ` · ${P.ofWhichEntries} ${formatILS(p.fromEntries)}`}
                        </span>
                      </span>
                      <span className="shrink-0 font-bold tabular-nums">{formatILS(p.total)}</span>
                    </summary>
                    <ul className="mt-1 space-y-0.5 border-s-2 ps-3 text-xs text-muted-foreground">
                      {weeks.map(([w, amount]) => (
                        <li key={w} className="flex justify-between gap-2">
                          <span>{fmtDate(w, true)}</span>
                          <span className="tabular-nums">{formatILS(amount)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              );
            })}
            <li className="flex items-center justify-between gap-3 pt-3 text-sm font-bold">
              <span>{P.grandTotal}</span>
              <span className="tabular-nums">{formatILS(s.grandTotal)}</span>
            </li>
          </ul>
        )}
      </Card>
    </div>
  );
}
