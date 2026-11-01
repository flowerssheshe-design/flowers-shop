"use client";

import * as React from "react";
import Link from "next/link";
import { KeyRound, Lock, Pencil, Phone, Plus, Trash2, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/toaster";
import { StaffPageHeader, type ShellEmployee } from "@/components/staff/StaffShell";
import { RESPONSIBILITIES, ROLE_LABELS, WORK_TYPE_LABELS, canManageTeam, type StaffRole, type WorkType } from "@/lib/staff/access";
import { T } from "@/lib/staff/labels";
import { formatILS } from "@/lib/utils";
import { OPS } from "@/lib/staff/ops/labels";
import { opsFetch } from "@/lib/staff/ops/client";
import { OPS_WORK_TYPES, WORK_TYPES, isLocked, isOpsManageable } from "@/lib/staff/ops/team";
import type { TeamMember, TeamMemberOwnerView } from "@/lib/staff/ops/types";
import { ConfirmDialog, EmptyBlock, ErrorBlock, Field, FormError, FormSheet, LoadingBlock, useOpsData } from "./common";

type Responsibility = Exclude<StaffRole, "worker">;

const RESPONSIBILITY_HINTS: Record<Responsibility, string> = {
  owner: "רואה ומשנה הכל: כסף, שכר, מוצרים והגדרות.",
  ops_manager: "הזמנות, שיבוץ משמרות, חלוקת התקציב, דוכנים ומוכרים.",
  marketing: "נתוני שיווק, קישורי מעקב, הודעות והתראות.",
};

/** "מנהל ראשי · אחראי שיווק", or "עובד" when there is no responsibility. */
function rolesText(m: { role: StaffRole; roles?: Responsibility[] }): string {
  const list = m.roles?.length ? m.roles : m.role === "worker" ? [] : [m.role as Responsibility];
  return list.length ? list.map((r) => ROLE_LABELS[r]).join(" · ") : ROLE_LABELS.worker;
}

type Member = TeamMember & Partial<Omit<TeamMemberOwnerView, keyof TeamMember>>;
type TeamResponse = { employees: Member[]; canManage: boolean; meId: string };

/** Current pay, read only. It is set on the pay page (/staff/payroll). */
function payText(m: Member): string {
  if (m.role === "owner") return "—";
  const resp = m.responsibility_pay ? `על האחריות ${formatILS(m.responsibility_pay)} לשבוע` : "";
  if (!m.pay_type) return resp || OPS.noPay;
  const rate = `${T.payType[m.pay_type]} · ${formatILS(m.pay_rate ?? 0)}`;
  return resp ? `${rate} · ${resp}` : rate;
}

export function TeamView({ me }: { me: ShellEmployee }) {
  const { data, error, loading, reload, setData } = useOpsData<TeamResponse>("/api/staff/team", (u) => opsFetch(u));
  const [showInactive, setShowInactive] = React.useState(false);
  const [editing, setEditing] = React.useState<Member | "new" | null>(null);
  const { toast } = useToast();
  // The server decides what data comes back; this only picks which controls to show.
  const canManage = canManageTeam(me) && (data?.canManage ?? true);
  // Shift managers add and edit stall sellers and couriers (no pay, no role changes).
  const isOps = me.role === "ops_manager";
  const canAdd = canManage || isOps;
  const canEdit = (m: Member) => canManage || (isOps && isOpsManageable(m));

  const list = (data?.employees ?? []).filter((m) => showInactive || m.is_active);
  const inactiveCount = (data?.employees ?? []).filter((m) => !m.is_active).length;

  function upsertLocal(m: Member) {
    setData((d) => {
      if (!d) return d;
      const exists = d.employees.some((e) => e.id === m.id);
      const employees = exists ? d.employees.map((e) => (e.id === m.id ? m : e)) : [...d.employees, m];
      employees.sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.full_name.localeCompare(b.full_name, "he"));
      return { ...d, employees };
    });
  }

  async function unlock(m: Member) {
    try {
      const res = await opsFetch<{ employee: Member }>(`/api/staff/team/${m.id}`, { method: "PATCH", body: { unlock: true } });
      upsertLocal(res.employee);
      toast({ title: OPS.unlocked, variant: "success" });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : T.saveError, variant: "error" });
    }
  }

  return (
    <div>
      <StaffPageHeader
        title={T.employees}
        description={
          canManage
            ? "הוספה ועריכה של עובדים, תפקידים וקוד כניסה. את השכר קובעים בדף שכר."
            : isOps
              ? "מוסיפים ועורכים מוכרי דוכן ושליחים. את השכר שלהם מחלקים מהתקציב השבועי בדף השיבוץ."
              : "רשימת העובדים הפעילים."
        }
        actions={
          canAdd && (
            <Button className="h-11 md:h-10" onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {OPS.addEmployee}
            </Button>
          )
        }
      />

      {canAdd && inactiveCount > 0 && (
        <label className="mb-4 flex w-fit items-center gap-2 text-sm">
          <Switch checked={showInactive} onCheckedChange={setShowInactive} />
          {OPS.showInactive} ({inactiveCount})
        </label>
      )}

      {loading && !data ? (
        <LoadingBlock />
      ) : error && !data ? (
        <ErrorBlock message={error} onRetry={reload} />
      ) : list.length === 0 ? (
        <EmptyBlock message={OPS.noEmployees} />
      ) : (
        <>
          {/* Mobile cards */}
          <ul className="space-y-3 md:hidden">
            {list.map((m) => (
              <li key={m.id} className="rounded-lg border bg-background p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium">
                      <span className="truncate">{m.full_name}</span>
                      {m.id === me.id && <span className="text-xs text-muted-foreground">(את/ה)</span>}
                    </p>
                    <p className="text-sm text-muted-foreground">{rolesText(m)}</p>
                  </div>
                  <StatusBadges m={m} />
                </div>
                <a href={`tel:${m.phone}`} dir="ltr" className="mt-2 inline-flex items-center gap-1 text-sm text-primary">
                  <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                  {m.phone}
                </a>
                {m.work_types.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {m.work_types.map((w) => (
                      <Badge key={w} variant="secondary">
                        {WORK_TYPE_LABELS[w]}
                      </Badge>
                    ))}
                  </div>
                )}
                {canEdit(m) && (
                  <>
                    {canManage && (
                      <p className="mt-2 text-sm">
                        <span className="text-muted-foreground">{T.payroll}: </span>
                        {payText(m)}
                      </p>
                    )}
                    <div className="mt-3 flex gap-2">
                      <Button variant="outline" className="h-11 flex-1" onClick={() => setEditing(m)}>
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                        {T.edit}
                      </Button>
                      {isLocked({ locked_until: m.locked_until ?? null }) && (
                        <Button variant="outline" className="h-11 flex-1" onClick={() => unlock(m)}>
                          <Unlock className="h-4 w-4" aria-hidden="true" />
                          {OPS.unlock}
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-lg border bg-background md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-right text-xs text-muted-foreground">
                <tr>
                  <th className="p-3 font-medium">{OPS.fullName}</th>
                  <th className="p-3 font-medium">{OPS.phone}</th>
                  <th className="p-3 font-medium">{OPS.role}</th>
                  <th className="p-3 font-medium">{OPS.workTypes}</th>
                  {canManage && <th className="p-3 font-medium">{T.payroll}</th>}
                  <th className="p-3 font-medium">מצב</th>
                  {canAdd && <th className="p-3" />}
                </tr>
              </thead>
              <tbody>
                {list.map((m) => (
                  <tr key={m.id} className="border-t">
                    <td className="p-3 font-medium">
                      {m.full_name}
                      {m.id === me.id && <span className="ms-1 text-xs text-muted-foreground">(את/ה)</span>}
                    </td>
                    <td className="p-3" dir="ltr" style={{ textAlign: "right" }}>
                      {m.phone}
                    </td>
                    <td className="p-3">{rolesText(m)}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {m.work_types.length === 0
                          ? "—"
                          : m.work_types.map((w) => (
                              <Badge key={w} variant="secondary">
                                {WORK_TYPE_LABELS[w]}
                              </Badge>
                            ))}
                      </div>
                    </td>
                    {canManage && <td className="p-3">{payText(m)}</td>}
                    <td className="p-3">
                      <StatusBadges m={m} />
                    </td>
                    {canAdd && !canEdit(m) && <td className="p-3" />}
                    {canEdit(m) && (
                      <td className="p-3">
                        <div className="flex justify-end gap-1">
                          {isLocked({ locked_until: m.locked_until ?? null }) && (
                            <Button variant="ghost" size="sm" onClick={() => unlock(m)}>
                              <Unlock className="h-4 w-4" aria-hidden="true" />
                              {OPS.unlock}
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => setEditing(m)}>
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                            {T.edit}
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {canAdd && editing && (
        <EmployeeForm
          limited={!canManage}
          key={editing === "new" ? "new" : editing.id}
          member={editing === "new" ? null : editing}
          isMe={editing !== "new" && editing.id === me.id}
          onClose={() => setEditing(null)}
          onSaved={(m) => {
            upsertLocal(m);
            setEditing(null);
            toast({ title: T.saved, variant: "success" });
          }}
          onDeleted={(id) => {
            setData((d) => (d ? { ...d, employees: d.employees.filter((e) => e.id !== id) } : d));
            setEditing(null);
            toast({ title: "העובד נמחק", variant: "success" });
          }}
        />
      )}
    </div>
  );
}

function StatusBadges({ m }: { m: Member }) {
  return (
    <div className="flex flex-wrap justify-end gap-1">
      {m.is_active ? (
        <Badge variant="outline" className="border-primary/40 text-primary">
          {OPS.active}
        </Badge>
      ) : (
        <Badge variant="outline">{OPS.inactive}</Badge>
      )}
      {isLocked({ locked_until: m.locked_until ?? null }) && (
        <Badge variant="destructive">
          <Lock className="h-3 w-3" aria-hidden="true" />
          {OPS.locked}
        </Badge>
      )}
    </div>
  );
}

function EmployeeForm({
  member,
  isMe,
  limited = false,
  onClose,
  onSaved,
  onDeleted,
}: {
  member: Member | null;
  isMe: boolean;
  /** Shift manager: stall sellers and couriers only, no role or pay. */
  limited?: boolean;
  onClose: () => void;
  onSaved: (m: Member) => void;
  onDeleted: (id: string) => void;
}) {
  const isNew = member === null;
  const [fullName, setFullName] = React.useState(member?.full_name ?? "");
  const [phone, setPhone] = React.useState(member?.phone ?? "");
  const [roles, setRoles] = React.useState<Responsibility[]>(member?.roles ?? []);
  const [workTypes, setWorkTypes] = React.useState<WorkType[]>(member?.work_types ?? []);
  const [active, setActive] = React.useState(member?.is_active ?? true);
  const [changePin, setChangePin] = React.useState(isNew);
  const [pin, setPin] = React.useState("");
  const [pin2, setPin2] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const isOwnerRole = roles.includes("owner");
  const workTypeOptions = limited ? OPS_WORK_TYPES : WORK_TYPES;

  function toggleWork(w: WorkType, on: boolean) {
    setWorkTypes((cur) => (on ? Array.from(new Set([...cur, w])) : cur.filter((x) => x !== w)));
  }

  function toggleRole(r: Responsibility, on: boolean) {
    setRoles((cur) => (on ? Array.from(new Set([...cur, r])) : cur.filter((x) => x !== r)));
  }

  async function remove() {
    setDeleting(true);
    try {
      await opsFetch(`/api/staff/team/${member!.id}`, { method: "DELETE" });
      onDeleted(member!.id);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : T.saveError);
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (fullName.trim().length < 2) return setErr("כתבו שם מלא (לפחות 2 תווים)");
    if (changePin) {
      if (!/^\d{4,8}$/.test(pin)) return setErr(OPS.pinFormat);
      if (pin !== pin2) return setErr(OPS.pinMismatch);
    }
    if (limited && workTypes.length === 0) return setErr("בחרו מוכר בדוכן, שליח או את שניהם.");

    const body: Record<string, unknown> = {
      full_name: fullName.trim(),
      phone: phone.trim(),
      roles: limited ? [] : roles,
      work_types: workTypes,
      is_active: active,
    };
    if (changePin) {
      body.pin = pin;
      body.pin_confirm = pin2;
    }

    setBusy(true);
    try {
      const res = await opsFetch<{ employee: Member }>(isNew ? "/api/staff/team" : `/api/staff/team/${member!.id}`, {
        method: isNew ? "POST" : "PATCH",
        body,
      });
      onSaved(res.employee);
    } catch (e2) {
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
      title={isNew ? OPS.addEmployee : OPS.editEmployee}
      footer={
        <>
          {!isNew && !isMe && (
            <Button
              variant="ghost"
              className="me-auto h-11 text-destructive hover:bg-destructive/10 hover:text-destructive sm:h-10"
              onClick={() => setConfirmDelete(true)}
              disabled={busy || deleting}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              מחיקת עובד
            </Button>
          )}
          <Button variant="outline" className="h-11 sm:h-10" onClick={onClose} disabled={busy}>
            {T.cancel}
          </Button>
          <Button className="h-11 sm:h-10" type="submit" form="employee-form" disabled={busy}>
            {busy ? T.saving : T.save}
          </Button>
        </>
      }
    >
      <form id="employee-form" onSubmit={submit} className="space-y-4">
        <Field label={OPS.fullName} htmlFor="emp-name">
          <Input id="emp-name" className="h-11 md:h-10" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="off" />
        </Field>
        <Field label={OPS.phone} htmlFor="emp-phone" hint="העובד נכנס עם המספר הזה.">
          <Input
            id="emp-phone"
            className="h-11 md:h-10"
            dir="ltr"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="050-1234567"
            autoComplete="off"
          />
        </Field>
        {!limited && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">אחריות</legend>
            <p className="text-xs text-muted-foreground">
              אפשר לסמן כמה, או אף אחת לעובד רגיל. האחריות קובעת מה רואים במערכת.
            </p>
            <div className="grid gap-2">
              {RESPONSIBILITIES.map((r) => {
                const lockSelf = isMe && r === "owner" && roles.includes("owner");
                return (
                  <label key={r} className="flex min-h-11 items-start gap-2 rounded-md border px-3 py-2 text-sm">
                    <Checkbox
                      className="mt-0.5"
                      checked={roles.includes(r)}
                      disabled={lockSelf}
                      onCheckedChange={(v) => toggleRole(r, v === true)}
                    />
                    <span>
                      <span className="font-medium">{ROLE_LABELS[r]}</span>
                      <span className="block text-xs text-muted-foreground">{RESPONSIBILITY_HINTS[r]}</span>
                      {lockSelf && <span className="block text-xs text-muted-foreground">אי אפשר להוריד מעצמך.</span>}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{OPS.workTypes}</legend>
          <p className="text-xs text-muted-foreground">
            {limited
              ? "מוכר בדוכן, שליח, או שניהם."
              : "נפרד מהאחריות: גם מנהל יכול לעבוד בדוכן. מנהלים יכולים לקבל כל משמרת גם בלי סימון."}
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {workTypeOptions.map((w) => (
              <label key={w} className="flex min-h-11 items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <Checkbox checked={workTypes.includes(w)} onCheckedChange={(v) => toggleWork(w, v === true)} />
                {WORK_TYPE_LABELS[w]}
              </label>
            ))}
          </div>
        </fieldset>

        <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          {limited ? (
            "השכר על דוכן ומשלוחים נקבע מהתקציב השבועי, בדף השיבוץ."
          ) : isOwnerRole ? (
            OPS.ownersNotPaid
          ) : (
            <>
              את השכר קובעים ב
              <Link href="/staff/payroll" className="font-medium text-primary underline">
                דף שכר
              </Link>
              . כאן רק הפרטים ומה העובד עושה.
            </>
          )}
        </p>

        <label className="flex min-h-11 items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
          <span>
            {OPS.active}
            {isMe && <span className="block text-xs text-muted-foreground">אי אפשר להפוך את עצמך ללא פעיל.</span>}
          </span>
          <Switch checked={active} disabled={isMe} onCheckedChange={setActive} />
        </label>

        <div className="space-y-3 rounded-md border p-3">
          {!isNew && !changePin ? (
            <Button type="button" variant="outline" className="h-11 w-full sm:h-10" onClick={() => setChangePin(true)}>
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              {OPS.setPin}
            </Button>
          ) : (
            <>
              <p className="text-sm font-medium">{isNew ? "קוד כניסה" : OPS.setPin}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={OPS.newPin} htmlFor="emp-pin">
                  <Input
                    id="emp-pin"
                    className="h-11 md:h-10"
                    type="password"
                    inputMode="numeric"
                    autoComplete="new-password"
                    dir="ltr"
                    maxLength={8}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  />
                </Field>
                <Field label={OPS.newPinAgain} htmlFor="emp-pin2">
                  <Input
                    id="emp-pin2"
                    className="h-11 md:h-10"
                    type="password"
                    inputMode="numeric"
                    autoComplete="new-password"
                    dir="ltr"
                    maxLength={8}
                    value={pin2}
                    onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))}
                  />
                </Field>
              </div>
              <p className="text-xs text-muted-foreground">{OPS.pinHint}</p>
            </>
          )}
        </div>

        <FormError message={err} />
      </form>
    </FormSheet>
    <ConfirmDialog
      open={confirmDelete}
      title={`למחוק את ${member?.full_name ?? ""}?`}
      description="העובד יוסר מכל הרשימות ולא יוכל להתחבר. משמרות עתידיות שלו יימחקו. משמרות שכבר עברו, שכר ומכירות נשמרים בהיסטוריה."
      confirmLabel="מחיקה"
      busy={deleting}
      onConfirm={remove}
      onCancel={() => setConfirmDelete(false)}
    />
    </>
  );
}
