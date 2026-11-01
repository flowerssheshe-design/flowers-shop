"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toaster";
import { Card, EmptyState, fmtDate, fmtWeek, sendJson } from "@/components/staff/owner/shared";
import { ConfirmDialog, Field, FormError, FormSheet, NativeSelect } from "@/components/staff/ops/common";
import { T } from "@/lib/staff/labels";
import { addDays } from "@/lib/staff/week";
import { formatILS } from "@/lib/utils";
import type { PayrollEntryView, PayrollResponse } from "@/lib/staff/owner/pay-summary";
import { P } from "./labels";

export function EntriesSection({ data, onChanged }: { data: PayrollResponse; onChanged: () => void }) {
  const [adding, setAdding] = React.useState(false);
  const [toDelete, setToDelete] = React.useState<PayrollEntryView | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const { toast } = useToast();

  async function remove() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await sendJson(`/api/staff/payroll/entries/${toDelete.id}`, "DELETE");
      toast({ title: "התשלום נמחק", variant: "success" });
      setToDelete(null);
      onChanged();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : T.saveError, variant: "error" });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card
      title={P.tabEntries}
      actions={
        <Button className="h-11 md:h-10" onClick={() => setAdding(true)} disabled={!data.ready || data.employees.length === 0}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {P.addEntry}
        </Button>
      }
    >
      <p className="mb-3 text-sm text-muted-foreground">{P.entriesHint}</p>
      {data.entries.length === 0 ? (
        <EmptyState title={P.noEntries} />
      ) : (
        <ul className="space-y-2">
          {data.entries.map((x) => (
            <li key={x.id} className="flex items-start justify-between gap-3 rounded-lg border bg-background p-3">
              <div className="min-w-0 text-sm">
                <p className="font-medium">
                  {x.employee_name ?? P.noEmployee}
                  {x.source === "migrated_expense" && (
                    <Badge variant="outline" className="ms-2 align-middle">
                      {P.migrated}
                    </Badge>
                  )}
                </p>
                <p className="break-words">{x.description}</p>
                <p className="text-xs text-muted-foreground">
                  {P.entryWeek}: {fmtWeek(x.week_start, addDays(x.week_start, 6))}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="font-bold tabular-nums">{formatILS(x.amount)}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-11 text-destructive hover:bg-destructive/10 hover:text-destructive sm:h-9"
                  onClick={() => setToDelete(x)}
                  aria-label={`${P.deleteEntry}: ${x.description}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  {T.delete}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <EntryForm
          data={data}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            toast({ title: T.saved, variant: "success" });
            onChanged();
          }}
        />
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title={toDelete ? `${P.deleteEntry}: ${toDelete.description} (${formatILS(toDelete.amount)})?` : P.deleteEntry}
        description={P.deleteEntryConfirm}
        confirmLabel={T.delete}
        busy={deleting}
        onConfirm={() => void remove()}
        onCancel={() => setToDelete(null)}
      />
    </Card>
  );
}

function EntryForm({ data, onClose, onSaved }: { data: PayrollResponse; onClose: () => void; onSaved: () => void }) {
  const weeks = React.useMemo(
    () => Array.from({ length: 12 }, (_, i) => addDays(data.week.weekStart, -7 * i)),
    [data.week.weekStart],
  );
  const [employeeId, setEmployeeId] = React.useState("");
  const [week, setWeek] = React.useState(weeks[0]);
  const [amount, setAmount] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setErr(null);
    if (!employeeId) return setErr("בחרו עובד.");
    const n = Number(amount);
    if (amount.trim() === "" || !Number.isFinite(n) || n <= 0) return setErr("כתבו סכום גדול מ-0.");
    if (description.trim().length < 2) return setErr("כתבו על מה התשלום (לפחות 2 תווים).");
    setBusy(true);
    try {
      await sendJson("/api/staff/payroll/entries", "POST", {
        employee_id: employeeId,
        week_start: week,
        amount: n,
        description: description.trim(),
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
      title={P.addEntry}
      footer={
        <>
          <Button variant="outline" className="h-11 sm:h-10" onClick={onClose} disabled={busy}>
            {T.cancel}
          </Button>
          <Button className="h-11 sm:h-10" type="submit" form="entry-form" disabled={busy}>
            {busy ? T.saving : T.save}
          </Button>
        </>
      }
    >
      <form id="entry-form" onSubmit={submit} className="space-y-4">
        <Field label={P.entryEmployee} htmlFor="entry-employee">
          <NativeSelect id="entry-employee" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">בחרו עובד</option>
            {data.employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.full_name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={P.entryWeek} htmlFor="entry-week">
          <NativeSelect id="entry-week" value={week} onChange={(e) => setWeek(e.target.value)}>
            {weeks.map((w, i) => (
              <option key={w} value={w}>
                {i === 0 ? `${T.thisWeek} · ` : ""}
                {fmtDate(w)}–{fmtDate(addDays(w, 6), true)}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={P.entryAmount} htmlFor="entry-amount">
          <Input
            id="entry-amount"
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
        <Field label={P.entryDescription} htmlFor="entry-description" hint="למשל: בונוס על חג, תוספת על שעות נוספות">
          <Input
            id="entry-description"
            className="h-11 md:h-10"
            maxLength={200}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <FormError message={err} />
      </form>
    </FormSheet>
  );
}
