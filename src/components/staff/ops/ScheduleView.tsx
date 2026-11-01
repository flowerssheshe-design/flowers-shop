"use client";

import * as React from "react";
import { AlertTriangle, Bike, Copy, Plus, Store, Trash2, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toaster";
import { StaffPageHeader, type ShellEmployee } from "@/components/staff/StaffShell";
import { ROLE_LABELS } from "@/lib/staff/access";
import { DAY_NAMES, T } from "@/lib/staff/labels";
import { addDays, israelDate } from "@/lib/staff/week";
import { cn } from "@/lib/utils";
import { OPS, SHIFT_TYPE_LABELS } from "@/lib/staff/ops/labels";
import { formatDate, opsFetch } from "@/lib/staff/ops/client";
import { SHIFT_TYPES, canBeWeekCourier, eligibleFor, findOverlaps, overlappingIds } from "@/lib/staff/ops/schedule";
import type { ScheduleData, Shift, ShiftType, TeamMember } from "@/lib/staff/ops/types";
import {
  ConfirmDialog,
  EmptyBlock,
  ErrorBlock,
  Field,
  FormError,
  FormSheet,
  LoadingBlock,
  NativeSelect,
  WeekPicker,
  useOpsData,
} from "./common";
import { BudgetPanel } from "./BudgetPanel";

const TYPE_ICON: Record<ShiftType, typeof Store> = { stall: Store, courier: Bike, supply: Truck };
const TYPE_STYLE: Record<ShiftType, string> = {
  stall: "border-s-primary",
  courier: "border-s-amber-500",
  supply: "border-s-sky-500",
};

type Draft = Omit<Shift, "id"> & { id?: string };

export function ScheduleView({ me }: { me: ShellEmployee }) {
  const [week, setWeek] = React.useState<string | null>(null);
  const url = `/api/staff/schedule${week ? `?week=${week}` : ""}`;
  const { data, error, loading, reload, setData } = useOpsData<ScheduleData>(url, (u) => opsFetch(u));
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [confirmCopy, setConfirmCopy] = React.useState(false);
  const [copying, setCopying] = React.useState(false);
  const [savingCourier, setSavingCourier] = React.useState(false);
  const { toast } = useToast();
  const today = israelDate();

  const names = React.useMemo(() => new Map((data?.employees ?? []).map((e) => [e.id, e.full_name])), [data]);
  const stallNames = React.useMemo(() => new Map((data?.stalls ?? []).map((s) => [s.id, s.name])), [data]);
  const overlaps = React.useMemo(() => overlappingIds(data?.shifts ?? []), [data]);
  const days = data ? Array.from({ length: 7 }, (_, i) => addDays(data.weekStart, i)) : [];

  function newShift(date: string) {
    setDraft({
      work_date: date,
      start_time: "08:00",
      end_time: "14:00",
      shift_type: "stall",
      stall_id: data?.stalls.find((s) => s.is_active)?.id ?? null,
      employee_id: "",
      notes: null,
    });
  }

  async function setCourier(employeeId: string) {
    if (!data) return;
    setSavingCourier(true);
    try {
      const res = await opsFetch<{ courierId: string | null }>("/api/staff/schedule/courier", {
        method: "PUT",
        body: { week: data.weekStart, employee_id: employeeId || null },
      });
      setData((d) => (d ? { ...d, courierId: res.courierId } : d));
      toast({ title: T.saved, variant: "success" });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : T.saveError, variant: "error" });
    } finally {
      setSavingCourier(false);
    }
  }

  async function copyLastWeek() {
    if (!data) return;
    setCopying(true);
    try {
      const res = await opsFetch<{ copied: number; skipped: number; courierCopied: boolean }>("/api/staff/schedule/copy", {
        method: "POST",
        body: { week: data.weekStart },
      });
      const parts = [`הועתקו ${res.copied} משמרות`];
      if (res.skipped) parts.push(`${res.skipped} דולגו (עובד או דוכן לא פעילים)`);
      if (res.courierCopied) parts.push("שליח השבוע הועתק");
      toast({ title: parts.join(" · "), variant: "success" });
      setConfirmCopy(false);
      void reload();
    } catch (e) {
      setConfirmCopy(false);
      toast({ title: e instanceof Error ? e.message : T.saveError, variant: "error" });
    } finally {
      setCopying(false);
    }
  }

  const courierPool = (data?.employees ?? []).filter((e) => canBeWeekCourier(e) || e.id === data?.courierId);

  return (
    <div>
      <StaffPageHeader
        title="שיבוץ משמרות"
        description="משבצים עובדים לדוכנים, למשלוחים ולאיסוף מהספק."
        actions={
          data && (
            <>
              <WeekPicker
                weekStart={data.weekStart}
                weekEnd={data.weekEnd}
                isCurrentWeek={data.isCurrentWeek}
                onChange={setWeek}
              />
              <Button variant="outline" className="h-11 md:h-10" onClick={() => setConfirmCopy(true)}>
                <Copy className="h-4 w-4" aria-hidden="true" />
                {OPS.copyLastWeek}
              </Button>
              <Button className="h-11 md:h-10" onClick={() => newShift(days.includes(today) ? today : data.weekStart)}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                {OPS.addShift}
              </Button>
            </>
          )
        }
      />

      {loading && !data ? (
        <LoadingBlock />
      ) : error && !data ? (
        <ErrorBlock message={error} onRetry={reload} />
      ) : data ? (
        <div className={cn("space-y-4", loading && "opacity-60")}>
          <div className="flex flex-col gap-2 rounded-lg border bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Bike className="h-5 w-5 text-amber-600" aria-hidden="true" />
              <div>
                <p className="font-medium">{OPS.courierOfWeek}</p>
                <p className="text-xs text-muted-foreground">רואה את כל המשלוחים של השבוע.</p>
              </div>
            </div>
            <NativeSelect
              className="sm:w-64"
              value={data.courierId ?? ""}
              disabled={savingCourier}
              onChange={(e) => setCourier(e.target.value)}
              aria-label={OPS.courierOfWeek}
            >
              <option value="">{OPS.noCourier}</option>
              {courierPool.map((e) => (
                <option key={e.id} value={e.id}>
                  {employeeLabel(e, me.id)}
                </option>
              ))}
            </NativeSelect>
          </div>

          {error && <ErrorBlock message={error} onRetry={reload} />}

          <BudgetPanel key={data.weekStart} week={data.weekStart} meId={me.id} />

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
            {days.map((date, i) => {
              const dayShifts = data.shifts
                .filter((s) => s.work_date === date)
                .sort((a, b) => a.start_time.localeCompare(b.start_time));
              return (
                <section
                  key={date}
                  className={cn(
                    "flex flex-col rounded-lg border bg-background",
                    date === today && "border-primary ring-1 ring-primary",
                  )}
                >
                  <header className="flex items-center justify-between border-b px-3 py-2">
                    <p className="text-sm font-semibold">
                      {DAY_NAMES[i]} <span className="font-normal text-muted-foreground">{formatDate(date)}</span>
                    </p>
                    <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => newShift(date)} aria-label={`${OPS.addShift} ${DAY_NAMES[i]}`}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </header>
                  <div className="flex-1 space-y-2 p-2">
                    {dayShifts.length === 0 ? (
                      <p className="px-1 py-2 text-xs text-muted-foreground">{OPS.noShifts}</p>
                    ) : (
                      dayShifts.map((s) => {
                        const Icon = TYPE_ICON[s.shift_type];
                        const clash = overlaps.has(s.id);
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => setDraft(s)}
                            className={cn(
                              "block w-full rounded-md border border-s-4 bg-muted/20 px-2.5 py-2 text-start text-sm transition hover:bg-accent",
                              TYPE_STYLE[s.shift_type],
                              clash && "border-destructive bg-destructive/5",
                            )}
                          >
                            <span className="flex items-center justify-between gap-1">
                              <span className="truncate font-medium">{names.get(s.employee_id) ?? "—"}</span>
                              {clash && <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-label={OPS.overlap} />}
                            </span>
                            <span className="mt-0.5 block text-xs text-muted-foreground" dir="ltr" style={{ textAlign: "right" }}>
                              {s.start_time}–{s.end_time}
                            </span>
                            <span className="mt-0.5 flex items-center gap-1 text-xs">
                              <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
                              <span className="truncate">
                                {s.shift_type === "stall"
                                  ? stallNames.get(s.stall_id ?? "") ?? SHIFT_TYPE_LABELS.stall
                                  : SHIFT_TYPE_LABELS[s.shift_type]}
                              </span>
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </section>
              );
            })}
          </div>
          {data.shifts.length === 0 && (
            <EmptyBlock message="אין עדיין משמרות בשבוע הזה. אפשר להוסיף משמרת או להעתיק מהשבוע הקודם." />
          )}
        </div>
      ) : null}

      {draft && data && (
        <ShiftForm
          key={draft.id ?? `new-${draft.work_date}`}
          draft={draft}
          data={data}
          meId={me.id}
          onClose={() => setDraft(null)}
          onSaved={(shift, warnings, removed) => {
            setDraft(null);
            setData((d) => {
              if (!d) return d;
              const rest = d.shifts.filter((s) => s.id !== (removed ?? shift?.id));
              const inWeek = shift && shift.work_date >= d.weekStart && shift.work_date <= d.weekEnd;
              return { ...d, shifts: shift && inWeek ? [...rest, shift] : rest };
            });
            if (warnings.length) toast({ title: "נשמר, אבל יש חפיפה", description: warnings.join("\n"), variant: "error" });
            else toast({ title: removed ? "המשמרת נמחקה" : T.saved, variant: "success" });
          }}
        />
      )}

      <ConfirmDialog
        open={confirmCopy}
        title="להעתיק את המשמרות מהשבוע הקודם?"
        description={
          data && data.shifts.length > 0
            ? `בשבוע הזה כבר יש ${data.shifts.length} משמרות. המשמרות מהשבוע הקודם יתווספו אליהן (לא יימחק כלום).`
            : "כל המשמרות של השבוע הקודם יועתקו לאותם ימים ושעות בשבוע הזה."
        }
        confirmLabel={OPS.copyLastWeek}
        destructive={false}
        busy={copying}
        onConfirm={copyLastWeek}
        onCancel={() => setConfirmCopy(false)}
      />
    </div>
  );
}

function employeeLabel(e: TeamMember, meId: string): string {
  const suffix = e.id === meId ? " (את/ה)" : e.role !== "worker" ? ` · ${ROLE_LABELS[e.role]}` : "";
  return `${e.full_name}${suffix}${e.is_active ? "" : " · לא פעיל"}`;
}

function ShiftForm({
  draft,
  data,
  meId,
  onClose,
  onSaved,
}: {
  draft: Draft;
  data: ScheduleData;
  meId: string;
  onClose: () => void;
  onSaved: (shift: Shift | null, warnings: string[], removedId?: string) => void;
}) {
  const isNew = !draft.id;
  const [v, setV] = React.useState<Draft>(draft);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const set = <K extends keyof Draft>(k: K, value: Draft[K]) => setV((cur) => ({ ...cur, [k]: value }));

  const days = Array.from({ length: 7 }, (_, i) => addDays(data.weekStart, i));
  if (!days.includes(v.work_date)) days.unshift(v.work_date);
  const eligible = eligibleFor(data.employees, v.shift_type);
  const current = data.employees.find((e) => e.id === v.employee_id);
  const employeeOk = !v.employee_id || eligible.some((e) => e.id === v.employee_id);
  const stalls = data.stalls.filter((s) => s.is_active || s.id === v.stall_id);
  const clashes =
    v.employee_id && v.end_time > v.start_time
      ? findOverlaps({ ...v, id: v.id }, data.shifts)
      : [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!v.employee_id) return setErr("בחרו עובד");
    if (!employeeOk) return setErr("לעובד הזה אין את סוג העבודה שמתאים למשמרת.");
    if (v.end_time <= v.start_time) return setErr("שעת הסיום חייבת להיות אחרי שעת ההתחלה");
    if (v.shift_type === "stall" && !v.stall_id) return setErr("במשמרת דוכן צריך לבחור דוכן");
    setBusy(true);
    try {
      const body = {
        work_date: v.work_date,
        start_time: v.start_time,
        end_time: v.end_time,
        shift_type: v.shift_type,
        stall_id: v.shift_type === "stall" ? v.stall_id : null,
        employee_id: v.employee_id,
        notes: v.notes?.trim() || null,
      };
      const res = await opsFetch<{ shift: Shift; warnings: string[] }>(
        isNew ? "/api/staff/schedule" : `/api/staff/schedule/${v.id}`,
        { method: isNew ? "POST" : "PATCH", body },
      );
      onSaved(res.shift, res.warnings ?? []);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : T.saveError);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await opsFetch(`/api/staff/schedule/${v.id}`, { method: "DELETE" });
      onSaved(null, [], v.id);
    } catch (e2) {
      setConfirmDelete(false);
      setErr(e2 instanceof Error ? e2.message : T.saveError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <FormSheet
        open
        onOpenChange={(o) => !o && !busy && onClose()}
        title={isNew ? OPS.addShift : OPS.editShift}
        footer={
          <>
            <Button variant="outline" className="h-11 sm:h-10" onClick={onClose} disabled={busy}>
              {T.cancel}
            </Button>
            <Button className="h-11 sm:h-10" type="submit" form="shift-form" disabled={busy}>
              {busy ? T.saving : T.save}
            </Button>
          </>
        }
      >
        <form id="shift-form" onSubmit={submit} className="space-y-4">
          <Field label={OPS.date} htmlFor="shift-date">
            <NativeSelect id="shift-date" value={v.work_date} onChange={(e) => set("work_date", e.target.value)}>
              {days.map((d) => {
                const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
                return (
                  <option key={d} value={d}>
                    {DAY_NAMES[dow]} {formatDate(d)}
                  </option>
                );
              })}
            </NativeSelect>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={OPS.start} htmlFor="shift-start">
              <Input
                id="shift-start"
                type="time"
                className="h-11 md:h-10"
                dir="ltr"
                value={v.start_time}
                onChange={(e) => set("start_time", e.target.value)}
              />
            </Field>
            <Field label={OPS.end} htmlFor="shift-end">
              <Input
                id="shift-end"
                type="time"
                className="h-11 md:h-10"
                dir="ltr"
                value={v.end_time}
                onChange={(e) => set("end_time", e.target.value)}
              />
            </Field>
          </div>
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">{OPS.shiftType}</legend>
            <div className="grid grid-cols-3 gap-2">
              {SHIFT_TYPES.map((t) => {
                const Icon = TYPE_ICON[t];
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => set("shift_type", t)}
                    aria-pressed={v.shift_type === t}
                    className={cn(
                      "flex min-h-12 flex-col items-center justify-center gap-1 rounded-md border px-2 py-2 text-xs font-medium",
                      v.shift_type === t ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent",
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {SHIFT_TYPE_LABELS[t]}
                  </button>
                );
              })}
            </div>
          </fieldset>
          {v.shift_type === "stall" && (
            <Field label={T.stall} htmlFor="shift-stall">
              <NativeSelect id="shift-stall" value={v.stall_id ?? ""} onChange={(e) => set("stall_id", e.target.value || null)}>
                <option value="">{OPS.chooseStall}</option>
                {stalls.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
          <Field
            label={OPS.employee}
            htmlFor="shift-employee"
            hint={eligible.length === 0 ? OPS.noEligible : "מוצגים רק עובדים שמתאימים לסוג המשמרת, ומנהלים."}
          >
            <NativeSelect id="shift-employee" value={v.employee_id} onChange={(e) => set("employee_id", e.target.value)}>
              <option value="">{OPS.chooseEmployee}</option>
              {!employeeOk && current && (
                <option value={current.id} disabled>
                  {employeeLabel(current, meId)} · לא מתאים
                </option>
              )}
              {eligible.map((e) => (
                <option key={e.id} value={e.id}>
                  {employeeLabel(e, meId)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {clashes.length > 0 && (
            <p className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {OPS.overlap}:{" "}
                {clashes.map((c) => `${c.start_time}–${c.end_time}`).join(", ")}. אפשר לשמור בכל זאת.
              </span>
            </p>
          )}
          <Field label={OPS.notes} htmlFor="shift-notes">
            <Textarea
              id="shift-notes"
              rows={2}
              value={v.notes ?? ""}
              onChange={(e) => set("notes", e.target.value)}
              maxLength={300}
            />
          </Field>
          <FormError message={err} />
          {!isNew && (
            <Button
              type="button"
              variant="ghost"
              className="h-11 w-full text-destructive hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              מחיקת המשמרת
            </Button>
          )}
        </form>
      </FormSheet>
      <ConfirmDialog
        open={confirmDelete}
        title={OPS.deleteShiftConfirm}
        confirmLabel={T.delete}
        busy={busy}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
