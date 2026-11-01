"use client";

import { formatILS } from "@/lib/utils";
import type { ExpenseSummary } from "@/lib/staff/owner/money";
import { Card, ErrorState, Line, LoadingState, fmtDate } from "../shared";
import { categoryLabel } from "./ExpenseForm";

export type SummaryResponse = { summary: ExpenseSummary; weekStart: string; weekEnd: string };

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function ExpensesSummaryCard({
  data,
  error,
  loading,
  onRetry,
}: {
  data: SummaryResponse | null;
  error: string | null;
  loading: boolean;
  onRetry: () => void;
}) {
  if (error && !data) return <ErrorState message={error} onRetry={onRetry} />;
  if (loading && !data) return <LoadingState label="מחשבים את סיכום ההוצאות…" />;
  if (!data) return null;
  const s = data.summary;

  return (
    <Card title="סיכום">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat
          label="כל ההוצאות עד עכשיו"
          value={formatILS(s.total)}
          sub={s.since ? `מ-${fmtDate(s.since, true)} · ${s.weeks} שבועות` : undefined}
        />
        <Stat label="השבוע" value={formatILS(s.thisWeek.total)} sub={`קבועות ${formatILS(s.thisWeek.recurring)} · חד-פעמיות ${formatILS(s.thisWeek.oneTime)}`} />
        <Stat label="החודש" value={formatILS(s.thisMonth)} />
        <Stat label="קבועות לשבוע עכשיו" value={formatILS(s.recurringPerWeek)} />
      </div>

      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div>
          <Line label="חד-פעמיות" value={formatILS(s.oneTime)} />
          <Line label="קבועות (כל קבועה כפול השבועות שבהם הייתה פעילה)" value={formatILS(s.recurring)} />
          <Line label="סה״כ עד עכשיו" value={formatILS(s.total)} strong />
        </div>
        <div>
          <h3 className="mb-1 text-sm font-bold">לפי קטגוריה (עד עכשיו)</h3>
          {s.byCategory.length === 0 ? (
            <p className="text-sm text-muted-foreground">עוד אין הוצאות</p>
          ) : (
            s.byCategory.map((c) => <Line key={c.category} label={categoryLabel(c.category)} value={formatILS(c.amount)} />)
          )}
        </div>
      </div>
    </Card>
  );
}
