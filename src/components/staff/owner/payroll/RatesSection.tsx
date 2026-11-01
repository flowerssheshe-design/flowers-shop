"use client";

import * as React from "react";
import { History, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toaster";
import { Card, EmptyState, fmtDate, sendJson } from "@/components/staff/owner/shared";
import { Field, FormError, FormSheet, NativeSelect } from "@/components/staff/ops/common";
import { ROLE_LABELS, WORK_TYPE_LABELS, type StaffRole, type WorkType } from "@/lib/staff/access";
import { T } from "@/lib/staff/labels";
import { formatILS } from "@/lib/utils";
import type { PayrollEmployeeView, PayrollResponse } from "@/lib/staff/owner/pay-summary";
import { P, rateText, sinceText } from "./labels";

export function RatesSection({ data, onChanged }: { data: PayrollResponse; onChanged: () => void }) {
  const [editing, setEditing] = React.useState<PayrollEmployeeView | null>(null);
  const { toast } = useToast();

  return (
    <div className="space-y-4">
      <BudgetCard data={data} onChanged={onChanged} />

      <Card title={P.employeesTitle}>
        <p className="mb-3 rounded-md bg-primary/5 px-3 py-2 text-sm">
          שינוי שכר חל מהשבוע של {fmtDate(data.week.weekStart, true)}. שבועות קודמים לא משתנים.
        </p>
        {data.employees.length === 0 ? (
          <EmptyState title={P.noEmployees} />
        ) : (
          <ul className="space-y-3">
            {data.employees.map((e) => (
              <EmployeePayCard key={e.id} e={e} onEdit={() => setEditing(e)} />
            ))}
          </ul>
        )}
      </Card>

      {editing && (
        <PayForm
          key={editing.id}
          employee={editing}
          weekStart={data.week.weekStart}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            toast({ title: T.saved, variant: "success" });
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function rolesOf(e: PayrollEmployeeView): string {
  const list = e.roles.filter((r) => r !== "worker" && r in ROLE_LABELS) as StaffRole[];
  return list.length ? list.map((r) => ROLE_LABELS[r]).join(" · ") : ROLE_LABELS.worker;
}

function EmployeePayCard({ e, onEdit }: { e: PayrollEmployeeView; onEdit: () => void }) {
  return (
    <li className="rounded-lg border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">{e.full_name}</p>
          <p className="text-sm text-muted-foreground">{rolesOf(e)}</p>
          {e.work_types.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {e.work_types.map((w) => (
                <Badge key={w} variant="secondary">
                  {WORK_TYPE_LABELS[w as WorkType] ?? w}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <Button variant="outline" className="h-11 sm:h-9" onClick={onEdit}>
          <Pencil className="h-4 w-4" aria-hidden="true" />
          {P.editPay}
        </Button>
      </div>

      <dl className="mt-3 space-y-1 text-sm">
        <div className="flex flex-wrap justify-between gap-2">
          <dt className="text-muted-foreground">{P.supplyRate}</dt>
          <dd className="font-medium">{rateText(e.current)}</dd>
        </div>
        {e.paysResponsibility && (
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-muted-foreground">{P.responsibility}</dt>
            <dd className="font-medium">
              {e.current.responsibility_pay ? `${formatILS(e.current.responsibility_pay)} ${P.perWeek}` : T.none}
            </dd>
          </div>
        )}
        {e.budgetPaid && <p className="text-xs text-muted-foreground">{P.fromBudget}</p>}
      </dl>

      <details className="mt-3 text-sm">
        <summary className="inline-flex min-h-11 cursor-pointer items-center gap-1 text-muted-foreground sm:min-h-0">
          <History className="h-4 w-4" aria-hidden="true" />
          {P.history}
        </summary>
        {e.history.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">{P.noHistory}</p>
        ) : (
          <ul className="mt-2 space-y-1 border-s-2 ps-3 text-xs">
            {e.history.map((h) => (
              <li key={h.effective_week}>
                <span className="font-medium">{sinceText(h.effective_week)}:</span> {P.supplyRate} {rateText(h)}
                {e.paysResponsibility && (
                  <>
                    {" · "}
                    {P.responsibility} {h.responsibility_pay ? formatILS(h.responsibility_pay) : T.none}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </details>
    </li>
  );
}

function PayForm({
  employee,
  weekStart,
  onClose,
  onSaved,
}: {
  employee: PayrollEmployeeView;
  weekStart: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [payType, setPayType] = React.useState<"" | "hourly" | "per_shift">(
    employee.current.pay_type === "hourly" || employee.current.pay_type === "per_shift" ? employee.current.pay_type : "",
  );
  const [rate, setRate] = React.useState(employee.current.pay_rate != null ? String(employee.current.pay_rate) : "");
  const [resp, setResp] = React.useState(
    employee.current.responsibility_pay != null ? String(employee.current.responsibility_pay) : "",
  );
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setErr(null);
    const rateNum = rate.trim() === "" ? null : Number(rate);
    if (payType && (rateNum === null || !Number.isFinite(rateNum) || rateNum < 0)) {
      return setErr("כתבו תעריף תקין (מספר 0 ומעלה).");
    }
    const respNum = resp.trim() === "" ? null : Number(resp);
    if (employee.paysResponsibility && respNum !== null && (!Number.isFinite(respNum) || respNum < 0)) {
      return setErr("כתבו סכום תקין לשכר על האחריות (מספר 0 ומעלה), או השאירו ריק.");
    }
    setBusy(true);
    try {
      await sendJson("/api/staff/payroll/rates", "PUT", {
        employee_id: employee.id,
        pay_type: payType || null,
        pay_rate: payType ? rateNum : null,
        responsibility_pay: employee.paysResponsibility ? respNum : null,
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : T.saveError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormSheet
      open
      onOpenChange={(o) => !o && !busy && onClose()}
      title={`${P.editPay}: ${employee.full_name}`}
      footer={
        <>
          <Button variant="outline" className="h-11 sm:h-10" onClick={onClose} disabled={busy}>
            {T.cancel}
          </Button>
          <Button className="h-11 sm:h-10" type="submit" form="pay-form" disabled={busy}>
            {busy ? T.saving : T.save}
          </Button>
        </>
      }
    >
      <form id="pay-form" onSubmit={submit} className="space-y-4">
        <p className="rounded-md bg-primary/5 px-3 py-2 text-sm">
          {P.fromThisWeek} (השבוע של {fmtDate(weekStart, true)})
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={P.payTypeLabel} htmlFor="pay-type">
            <NativeSelect
              id="pay-type"
              value={payType}
              onChange={(e) => setPayType(e.target.value as "" | "hourly" | "per_shift")}
            >
              <option value="">{P.noRateOption}</option>
              <option value="hourly">{T.payType.hourly}</option>
              <option value="per_shift">{T.payType.per_shift}</option>
            </NativeSelect>
          </Field>
          {payType && (
            <Field label={P.rateLabel} htmlFor="pay-rate">
              <Input
                id="pay-rate"
                className="h-11 md:h-10"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.5"
                dir="ltr"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
            </Field>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          התעריף משמש רק למשמרות איסוף מהספק. דוכן ומשלוחים משולמים מהתקציב השבועי.
        </p>

        {employee.paysResponsibility && (
          <Field label={P.respLabel} htmlFor="pay-resp" hint={P.respHint}>
            <Input
              id="pay-resp"
              className="h-11 md:h-10"
              type="number"
              inputMode="decimal"
              min={0}
              step="1"
              dir="ltr"
              value={resp}
              onChange={(e) => setResp(e.target.value)}
            />
          </Field>
        )}

        <FormError message={err} />
      </form>
    </FormSheet>
  );
}

function BudgetCard({ data, onChanged }: { data: PayrollResponse; onChanged: () => void }) {
  const [amount, setAmount] = React.useState(data.budget.amount != null ? String(data.budget.amount) : "");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const { toast } = useToast();

  React.useEffect(() => {
    setAmount(data.budget.amount != null ? String(data.budget.amount) : "");
  }, [data.budget.amount]);

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    setErr(null);
    const n = Number(amount);
    if (amount.trim() === "" || !Number.isFinite(n) || n < 0) return setErr("כתבו סכום תקין (מספר 0 ומעלה).");
    setBusy(true);
    try {
      await sendJson("/api/staff/schedule/pay", "PUT", { week: data.week.weekStart, amount: n });
      toast({ title: T.saved, variant: "success" });
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : T.saveError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={P.budgetTitle}>
      <p className="text-sm text-muted-foreground">{P.budgetHint}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg border bg-background p-3">
          <p className="text-muted-foreground">השבוע של {fmtDate(data.week.weekStart)}</p>
          <p className="text-lg font-bold tabular-nums">
            {data.budget.amount != null ? formatILS(data.budget.amount) : P.budgetNotSet}
          </p>
        </div>
        <div className="rounded-lg border bg-background p-3">
          <p className="text-muted-foreground">{P.budgetAllocated}</p>
          <p className="text-lg font-bold tabular-nums">{formatILS(data.budget.allocated)}</p>
        </div>
      </div>
      {data.budget.closed ? (
        <p className="mt-3 text-sm text-muted-foreground">{P.budgetClosed}</p>
      ) : (
        <form onSubmit={save} className="mt-3 flex flex-wrap items-end gap-2">
          <div className="min-w-[10rem] flex-1">
            <Field label={P.budgetAmount} htmlFor="budget-amount">
              <Input
                id="budget-amount"
                className="h-11 md:h-10"
                type="number"
                inputMode="decimal"
                min={0}
                step="1"
                dir="ltr"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
          </div>
          <Button type="submit" className="h-11 md:h-10" disabled={busy}>
            {busy ? T.saving : P.setBudget}
          </Button>
        </form>
      )}
      <div className="mt-2">
        <FormError message={err} />
      </div>
    </Card>
  );
}
