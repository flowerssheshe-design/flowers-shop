"use client";

import * as React from "react";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toaster";
import { ROLE_LABELS, type StaffRole } from "@/lib/staff/access";
import { T } from "@/lib/staff/labels";
import { cn, formatILS } from "@/lib/utils";
import { opsFetch } from "@/lib/staff/ops/client";
import { ErrorBlock, LoadingBlock, useOpsData } from "./common";

type Person = {
  id: string;
  full_name: string;
  role: StaffRole;
  work_types: string[];
  is_active: boolean;
  shifts: number;
  hours: number;
  amount: number;
  note: string | null;
};

type PayData = {
  week: string;
  budget: number | null;
  allocated: number;
  closed: boolean;
  canSetBudget: boolean;
  people: Person[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Weekly pay budget for stall sellers and the courier. Owners set the amount;
 * the shift manager splits it (himself included) and can't go over it.
 */
export function BudgetPanel({ week, meId }: { week: string; meId: string }) {
  const url = `/api/staff/schedule/pay?week=${week}`;
  const { data, error, loading, reload } = useOpsData<PayData>(url, (u) => opsFetch(u));
  const [amounts, setAmounts] = React.useState<Record<string, string>>({});
  const [budgetInput, setBudgetInput] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [savingBudget, setSavingBudget] = React.useState(false);
  const { toast } = useToast();

  React.useEffect(() => {
    if (!data) return;
    setAmounts(Object.fromEntries(data.people.map((p) => [p.id, p.amount ? String(p.amount) : ""])));
    setBudgetInput(data.budget === null ? "" : String(data.budget));
  }, [data]);

  if (loading && !data) return <LoadingBlock />;
  if (error && !data) return <ErrorBlock message={error} onRetry={reload} />;
  if (!data) return null;

  const total = round2(Object.values(amounts).reduce((sum, v) => sum + (Number(v) || 0), 0));
  const left = data.budget === null ? null : round2(data.budget - total);
  const over = left !== null && left < 0;
  const dirty = data.people.some((p) => (Number(amounts[p.id]) || 0) !== p.amount);
  const locked = data.closed;

  async function saveBudget() {
    const amount = Number(budgetInput);
    if (!Number.isFinite(amount) || amount < 0) {
      toast({ title: "הזינו סכום תקין", variant: "error" });
      return;
    }
    setSavingBudget(true);
    try {
      await opsFetch(url.split("?")[0], { method: "PUT", body: { week, amount } });
      toast({ title: "התקציב נשמר", variant: "success" });
      reload();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : T.saveError, variant: "error" });
    } finally {
      setSavingBudget(false);
    }
  }

  async function saveSplit() {
    setSaving(true);
    try {
      await opsFetch(url.split("?")[0], {
        method: "POST",
        body: {
          week,
          allocations: data!.people.map((p) => ({ employee_id: p.id, amount: Number(amounts[p.id]) || 0 })),
        },
      });
      toast({ title: "החלוקה נשמרה", variant: "success" });
      reload();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : T.saveError, variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={cn("rounded-lg border bg-background p-4", loading && "opacity-60")}>
      <div className="mb-3 flex items-start gap-2">
        <Wallet className="mt-0.5 h-5 w-5 text-primary" aria-hidden="true" />
        <div>
          <h2 className="font-semibold">תקציב שכר לשבוע</h2>
          <p className="text-xs text-muted-foreground">
            למוכרי הדוכנים ולשליח. המנהלים קובעים את הסכום, ומנהל המשמרות מחלק אותו איך שהוא רוצה.
          </p>
        </div>
      </div>

      {/* Budget amount */}
      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-md bg-muted/50 p-3">
          <p className="text-xs text-muted-foreground">התקציב</p>
          {data.canSetBudget && !locked ? (
            <div className="mt-1 flex gap-2">
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                value={budgetInput}
                onChange={(e) => setBudgetInput(e.target.value)}
                placeholder="500"
                className="h-10"
                aria-label="סכום התקציב לשבוע"
              />
              <Button className="h-10" onClick={saveBudget} disabled={savingBudget}>
                {savingBudget ? T.saving : T.save}
              </Button>
            </div>
          ) : (
            <p className="mt-1 text-xl font-bold tabular-nums">
              {data.budget === null ? "לא נקבע" : formatILS(data.budget)}
            </p>
          )}
        </div>
        <div className="rounded-md bg-muted/50 p-3">
          <p className="text-xs text-muted-foreground">חולק</p>
          <p className="mt-1 text-xl font-bold tabular-nums">{formatILS(total)}</p>
        </div>
        <div className={cn("rounded-md p-3", over ? "bg-destructive/10" : "bg-muted/50")}>
          <p className="text-xs text-muted-foreground">נשאר לחלק</p>
          <p className={cn("mt-1 text-xl font-bold tabular-nums", over && "text-destructive")}>
            {left === null ? "—" : formatILS(left)}
          </p>
        </div>
      </div>

      {data.budget === null && !data.canSetBudget && (
        <p className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
          המנהלים עוד לא קבעו תקציב לשבוע הזה, אז אי אפשר לחלק עדיין.
        </p>
      )}
      {locked && <p className="mb-3 text-sm text-muted-foreground">השבוע הזה נסגר, אי אפשר לשנות את החלוקה.</p>}

      {/* Split */}
      {data.people.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          אין עדיין מוכרי דוכן או שליחים. מוסיפים אותם בדף העובדים.
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {data.people.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <div className="min-w-0">
                <p className="font-medium">
                  {p.full_name}
                  {p.id === meId && <span className="text-muted-foreground"> (אני)</span>}
                  {!p.is_active && <span className="text-xs text-muted-foreground"> · לא פעיל</span>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {p.role === "ops_manager" ? ROLE_LABELS.ops_manager + " · " : ""}
                  {p.shifts > 0 ? `${p.shifts} משמרות · ${p.hours} שעות השבוע` : "אין משמרות השבוע"}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={amounts[p.id] ?? ""}
                  onChange={(e) => setAmounts((a) => ({ ...a, [p.id]: e.target.value }))}
                  disabled={locked || data.budget === null}
                  placeholder="0"
                  className="h-11 w-28 text-left tabular-nums"
                  dir="ltr"
                  aria-label={`סכום ל${p.full_name}`}
                />
                <span className="text-sm text-muted-foreground">₪</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {data.people.length > 0 && !locked && data.budget !== null && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          {over ? (
            <p className="text-sm text-destructive">חילקתם יותר מהתקציב. הורידו {formatILS(-left!)}.</p>
          ) : (
            <span />
          )}
          <Button className="h-11" onClick={saveSplit} disabled={saving || over || !dirty}>
            {saving ? T.saving : "שמירת החלוקה"}
          </Button>
        </div>
      )}
    </section>
  );
}
