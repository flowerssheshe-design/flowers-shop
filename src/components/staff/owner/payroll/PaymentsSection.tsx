"use client";

import * as React from "react";
import { Check, Plus, Trash2, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toaster";
import { Card, EmptyState, fmtDateTime, fmtWeek, sendJson } from "@/components/staff/owner/shared";
import { T } from "@/lib/staff/labels";
import { addDays } from "@/lib/staff/week";
import { cn, formatILS } from "@/lib/utils";
import type { PayrollResponse } from "@/lib/staff/owner/pay-summary";
import type { DuePerson, DueWeek } from "@/lib/staff/owner/payments";

/**
 * "תשלומים": how much to pay each employee per week (what it is made of),
 * adding one-off items, and "שולם". On top: paid in the last 30 days, ever,
 * and what is still owed.
 */
export function PaymentsSection({ data, onChanged }: { data: PayrollResponse; onChanged: () => void }) {
  const view = data.payments;
  const [weekStart, setWeekStart] = React.useState<string | null>(null);

  if (!view) {
    return (
      <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        כדי לרשום תשלומים צריך להריץ את מיגרציה 046 ב-Supabase.
      </p>
    );
  }

  const week = view.weeks.find((w) => w.weekStart === weekStart) ?? view.weeks.find((w) => w.left > 0) ?? view.weeks[0] ?? null;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <Card title="סיכום תשלומים">
        {view.summary.length === 0 ? (
          <EmptyState title="עוד לא נרשמו תשלומים" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-right text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="p-2 font-medium">עובד</th>
                  <th className="p-2 font-medium">שולם ב-30 יום</th>
                  <th className="p-2 font-medium">שולם מאז ומעולם</th>
                  <th className="p-2 font-medium">עוד צריך לשלם</th>
                </tr>
              </thead>
              <tbody>
                {view.summary.map((r) => (
                  <tr key={r.employee_id} className="border-b last:border-0">
                    <td className="p-2 font-medium">{r.full_name}</td>
                    <td className="p-2 tabular-nums">{formatILS(r.paidLast30)}</td>
                    <td className="p-2 tabular-nums">{formatILS(r.paidAll)}</td>
                    <td className={cn("p-2 tabular-nums", r.owed > 0 && "font-semibold text-amber-700")}>{formatILS(r.owed)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 font-bold">
                  <td className="p-2">סך הכל</td>
                  <td className="p-2 tabular-nums">{formatILS(view.totals.paidLast30)}</td>
                  <td className="p-2 tabular-nums">{formatILS(view.totals.paidAll)}</td>
                  <td className="p-2 tabular-nums">{formatILS(view.totals.owed)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Week to pay */}
      <Card title="לתשלום">
        {view.weeks.length === 0 ? (
          <EmptyState title="אין שכר לשלם" />
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-2" role="tablist" aria-label="שבוע">
              {view.weeks.map((w) => (
                <button
                  key={w.weekStart}
                  type="button"
                  role="tab"
                  aria-selected={week?.weekStart === w.weekStart}
                  onClick={() => setWeekStart(w.weekStart)}
                  className={cn(
                    "min-h-11 rounded-md border px-3 text-sm",
                    week?.weekStart === w.weekStart ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent",
                  )}
                >
                  {w.isCurrent ? "השבוע" : fmtWeek(w.weekStart, addDays(w.weekStart, 6))}
                  {w.left > 0 && <span className="ms-1 font-semibold">· {formatILS(w.left)}</span>}
                </button>
              ))}
            </div>
            {week && <WeekPayments week={week} employees={data.employees} onChanged={onChanged} />}
          </>
        )}
      </Card>
    </div>
  );
}

function WeekPayments({
  week,
  employees,
  onChanged,
}: {
  week: DueWeek;
  employees: PayrollResponse["employees"];
  onChanged: () => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {week.isCurrent ? "השבוע עוד לא נגמר: הסכום יכול לגדול עד סוף השבוע. " : ""}
        סה״כ לשבוע: <b>{formatILS(week.total)}</b> · נשאר לשלם: <b>{formatILS(week.left)}</b>
      </p>
      {week.people.length === 0 ? (
        <EmptyState title="אין שכר בשבוע הזה" />
      ) : (
        <ul className="space-y-3">
          {week.people.map((p) => (
            <PersonCard key={p.employee_id} weekStart={week.weekStart} person={p} onChanged={onChanged} />
          ))}
        </ul>
      )}
      <AddForOther weekStart={week.weekStart} employees={employees.filter((e) => !week.people.some((p) => p.employee_id === e.id))} onChanged={onChanged} />
    </div>
  );
}

function PersonCard({ weekStart, person, onChanged }: { weekStart: string; person: DuePerson; onChanged: () => void }) {
  const { toast } = useToast();
  const [amount, setAmount] = React.useState(person.left > 0 ? String(person.left) : "");
  const [busy, setBusy] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [desc, setDesc] = React.useState("");
  const [extra, setExtra] = React.useState("");

  React.useEffect(() => setAmount(person.left > 0 ? String(person.left) : ""), [person.left]);

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await fn();
      toast({ title: done, variant: "success" });
      onChanged();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : T.saveError, variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  const pay = () => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      toast({ title: "כתבו סכום גדול מ-0", variant: "error" });
      return;
    }
    void run(
      () => sendJson("/api/staff/payroll/payments", "POST", { employee_id: person.employee_id, week_start: weekStart, amount: n }),
      `נרשם: שולם ${formatILS(n)} ל${person.full_name}`,
    );
  };

  const addItem = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(extra);
    if (desc.trim().length < 2 || !Number.isFinite(n) || n <= 0) {
      toast({ title: "כתבו על מה ההוספה וסכום גדול מ-0", variant: "error" });
      return;
    }
    void run(async () => {
      await sendJson("/api/staff/payroll/entries", "POST", { employee_id: person.employee_id, week_start: weekStart, amount: n, description: desc.trim() });
      setDesc("");
      setExtra("");
      setAdding(false);
    }, "נוסף לשכר של השבוע");
  };

  return (
    <li className={cn("rounded-lg border bg-background p-3", person.left === 0 && "bg-muted/30")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-semibold">{person.full_name}</p>
        {person.left === 0 ? (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
            <Check className="h-4 w-4" aria-hidden="true" />
            שולם הכל
          </span>
        ) : (
          <span className="text-sm font-semibold text-amber-700">נשאר {formatILS(person.left)}</span>
        )}
      </div>

      <ul className="mt-2 space-y-1 text-sm">
        {person.parts.map((part, i) => (
          <li key={i} className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              {/* ✓ = paid this week, ✗ = skipped this week only. */}
              <button
                type="button"
                role="switch"
                aria-checked={!part.excluded}
                aria-label={`${part.excluded ? "להחזיר" : "לא לשלם השבוע"}: ${part.label}`}
                title={part.excluded ? "לא משולם השבוע. לחיצה מחזירה." : "לחיצה: לא לשלם את זה השבוע"}
                disabled={busy}
                onClick={() =>
                  void run(
                    () =>
                      sendJson("/api/staff/payroll/exclusions", "PUT", {
                        employee_id: person.employee_id,
                        week_start: weekStart,
                        part: part.key,
                        excluded: !part.excluded,
                      }),
                    part.excluded ? `${part.label}: חזר לתשלום` : `${part.label}: לא ישולם השבוע`,
                  )
                }
                className={cn(
                  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
                  part.excluded ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-primary/40 bg-primary/10 text-primary",
                )}
              >
                {part.excluded ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              </button>
              <span className={cn("min-w-0 truncate", part.excluded && "text-muted-foreground line-through")}>{part.label}</span>
            </span>
            <span className={cn("flex shrink-0 items-center gap-1 tabular-nums", part.excluded && "text-muted-foreground line-through")}>
              {formatILS(part.amount)}
              {part.entryId && (
                <button
                  type="button"
                  className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
                  aria-label={`מחיקת ${part.label}`}
                  disabled={busy}
                  onClick={() =>
                    window.confirm(`למחוק את "${part.label}"?`) &&
                    void run(() => sendJson(`/api/staff/payroll/entries/${part.entryId}`, "DELETE"), "השורה נמחקה")
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </span>
          </li>
        ))}
        <li className="flex justify-between gap-2 border-t pt-1 font-semibold">
          <span>סה״כ</span>
          <span className="tabular-nums">{formatILS(person.due)}</span>
        </li>
      </ul>

      {person.payments.length > 0 && (
        <ul className="mt-2 space-y-1 rounded-md bg-primary/5 p-2 text-sm">
          {person.payments.map((pay) => (
            <li key={pay.id} className="flex items-center justify-between gap-2">
              <span>
                שולם {formatILS(pay.amount)} <span className="text-xs text-muted-foreground">· {fmtDateTime(pay.paid_at)}</span>
              </span>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
                disabled={busy}
                onClick={() =>
                  window.confirm(`לבטל את התשלום של ${formatILS(pay.amount)}?`) &&
                  void run(() => sendJson(`/api/staff/payroll/payments/${pay.id}`, "DELETE"), "התשלום בוטל")
                }
              >
                <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                ביטול
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <form onSubmit={addItem} className="mt-3 flex flex-wrap items-end gap-2">
          <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="על מה? למשל: שעה נוספת" className="h-11 min-w-0 flex-1" aria-label="על מה" />
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            dir="ltr"
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            placeholder="50"
            className="h-11 w-24 text-left tabular-nums"
            aria-label="סכום"
          />
          <Button type="submit" className="h-11" disabled={busy}>
            {T.save}
          </Button>
          <Button type="button" variant="ghost" className="h-11" onClick={() => setAdding(false)} disabled={busy}>
            {T.cancel}
          </Button>
        </form>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          <Plus className="h-4 w-4" aria-hidden="true" />
          הוספת שורה (שעה נוספת, בונוס…)
        </button>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          dir="ltr"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          className="h-11 w-28 text-left tabular-nums"
          aria-label={`סכום לתשלום ל${person.full_name}`}
        />
        <span className="text-sm text-muted-foreground">₪</span>
        <Button className="h-11" onClick={pay} disabled={busy || !(Number(amount) > 0)}>
          <Check className="h-4 w-4" aria-hidden="true" />
          שולם
        </Button>
      </div>
    </li>
  );
}

/** Add a one-off item for someone with no pay this week (e.g. a one-time job). */
function AddForOther({
  weekStart,
  employees,
  onChanged,
}: {
  weekStart: string;
  employees: PayrollResponse["employees"];
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [who, setWho] = React.useState("");
  const [desc, setDesc] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  if (employees.length === 0) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(amount);
    if (!who || desc.trim().length < 2 || !(n > 0)) {
      toast({ title: "בחרו עובד, כתבו על מה וסכום", variant: "error" });
      return;
    }
    setBusy(true);
    try {
      await sendJson("/api/staff/payroll/entries", "POST", { employee_id: who, week_start: weekStart, amount: n, description: desc.trim() });
      toast({ title: "נוסף לשכר של השבוע", variant: "success" });
      setOpen(false);
      setWho("");
      setDesc("");
      setAmount("");
      onChanged();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : T.saveError, variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  return open ? (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-3">
      <select value={who} onChange={(e) => setWho(e.target.value)} className="h-11 rounded-md border bg-background px-2 text-sm" aria-label="עובד">
        <option value="">בחרו עובד</option>
        {employees.map((e) => (
          <option key={e.id} value={e.id}>
            {e.full_name}
          </option>
        ))}
      </select>
      <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="על מה?" className="h-11 min-w-0 flex-1" aria-label="על מה" />
      <Input type="number" inputMode="decimal" min={0} dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="50" className="h-11 w-24 text-left" aria-label="סכום" />
      <Button type="submit" className="h-11" disabled={busy}>
        {T.save}
      </Button>
      <Button type="button" variant="ghost" className="h-11" onClick={() => setOpen(false)}>
        {T.cancel}
      </Button>
    </form>
  ) : (
    <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
      <Plus className="h-4 w-4" aria-hidden="true" />
      תשלום לעובד אחר בשבוע הזה
    </button>
  );
}
