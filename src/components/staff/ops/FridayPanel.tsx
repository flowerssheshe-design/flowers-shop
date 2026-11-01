"use client";

import * as React from "react";
import { Bike, CalendarDays, PackageOpen, Store, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toaster";
import { T } from "@/lib/staff/labels";
import { addDays } from "@/lib/staff/week";
import { cn } from "@/lib/utils";
import { formatDate, opsFetch } from "@/lib/staff/ops/client";
import { eligibleFor } from "@/lib/staff/ops/schedule";
import type { ScheduleData, Shift, ShiftType, TeamMember } from "@/lib/staff/ops/types";
import { FormSheet, WeekPicker, useOpsData } from "./common";

// The stalls run on Friday only, so staffing is just "who works Friday".
const FRIDAY_OFFSET = 5;
const DEFAULT_HOURS: Record<"stall" | "supply", { start: string; end: string }> = {
  stall: { start: "09:00", end: "14:00" },
  supply: { start: "07:00", end: "09:00" },
};

const hhmm = (t: string) => t.slice(0, 5);

export type FridayState = {
  data: ScheduleData | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
  setWeek: (w: string | null) => void;
  friday: string | null;
  fridayShifts: Shift[];
  names: Map<string, string>;
};

/** The selected week's schedule, focused on its Friday. */
export function useFriday(): FridayState {
  const [week, setWeek] = React.useState<string | null>(null);
  const url = `/api/staff/schedule${week ? `?week=${week}` : ""}`;
  const { data, error, loading, reload } = useOpsData<ScheduleData>(url, (u) => opsFetch(u));
  const friday = data ? addDays(data.weekStart, FRIDAY_OFFSET) : null;
  const fridayShifts = React.useMemo(
    () => (data && friday ? data.shifts.filter((s) => s.work_date === friday) : []),
    [data, friday],
  );
  const names = React.useMemo(() => new Map((data?.employees ?? []).map((e) => [e.id, e.full_name])), [data]);
  return { data, error, loading, reload, setWeek, friday, fridayShifts, names };
}

/** Week picker + where things stand on Friday. */
export function FridayBar({ f, showSupply }: { f: FridayState; showSupply: boolean }) {
  if (!f.data || !f.friday) return null;
  const stallShifts = f.fridayShifts.filter((s) => s.shift_type === "stall");
  const supply = f.fridayShifts.filter((s) => s.shift_type === "supply");
  const courier = f.data.courierId ? f.names.get(f.data.courierId) : null;
  const activeStalls = f.data.stalls.filter((s) => s.is_active);
  const emptyStalls = activeStalls.filter((st) => !stallShifts.some((s) => s.stall_id === st.id));

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-background p-4 md:flex-row md:items-center md:justify-between">
      <div className="flex items-start gap-2">
        <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-semibold">
            שיבוץ ל{formatDate(f.friday, { weekday: "long", day: "numeric", month: "numeric" })}
          </p>
          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <li className={cn(emptyStalls.length ? "text-amber-700" : "text-muted-foreground")}>
              <Users className="me-1 inline h-3.5 w-3.5" aria-hidden="true" />
              {stallShifts.length} מוכרים
              {emptyStalls.length > 0 && ` · ${emptyStalls.map((s) => s.name).join(", ")} בלי מוכר`}
            </li>
            <li className={cn(courier ? "text-muted-foreground" : "text-amber-700")}>
              <Bike className="me-1 inline h-3.5 w-3.5" aria-hidden="true" />
              שליח: {courier ?? "לא נבחר"}
            </li>
            {showSupply && (
              <li className={cn(supply.length ? "text-muted-foreground" : "text-amber-700")}>
                <PackageOpen className="me-1 inline h-3.5 w-3.5" aria-hidden="true" />
                איסוף מהספק: {supply.length ? supply.map((s) => f.names.get(s.employee_id) ?? "עובד").join(", ") : "לא נקבע"}
              </li>
            )}
          </ul>
        </div>
      </div>
      <WeekPicker
        weekStart={f.data.weekStart}
        weekEnd={f.data.weekEnd}
        isCurrentWeek={f.data.isCurrentWeek}
        onChange={f.setWeek}
      />
    </div>
  );
}

/** Inside a stall card: who sells there on Friday, and a "שיבוץ" button. */
export function StallFridayStaff({ f, stallId, stallName, meId }: { f: FridayState; stallId: string; stallName: string; meId: string }) {
  const [open, setOpen] = React.useState(false);
  const here = f.fridayShifts.filter((s) => s.shift_type === "stall" && s.stall_id === stallId);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Users className="h-4 w-4" aria-hidden="true" />
          {f.friday ? `ביום שישי ${formatDate(f.friday)}` : "ביום שישי"}
        </p>
        <Button variant="outline" size="sm" className="h-9" onClick={() => setOpen(true)} disabled={!f.data}>
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          שיבוץ
        </Button>
      </div>
      {here.length === 0 ? (
        <p className="text-sm text-amber-700">עוד לא שובצו מוכרים.</p>
      ) : (
        <ShiftList shifts={here} names={f.names} />
      )}
      {open && f.data && f.friday && (
        <PickDialog
          title={`מוכרים ב${stallName}`}
          f={f}
          type="stall"
          stallId={stallId}
          current={here}
          candidates={eligibleFor(f.data.employees.filter((e) => e.is_active), "stall")}
          meId={meId}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

/** Who brings the flowers from the supplier on Friday morning (owners decide). */
export function SupplyCard({ f, meId }: { f: FridayState; meId: string }) {
  const [open, setOpen] = React.useState(false);
  if (!f.data || !f.friday) return null;
  const here = f.fridayShifts.filter((s) => s.shift_type === "supply");
  return (
    <section className="rounded-lg border bg-background p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <PackageOpen className="mt-0.5 h-5 w-5 text-sky-600" aria-hidden="true" />
          <div>
            <h3 className="font-semibold">איסוף מהספק</h3>
            <p className="text-xs text-muted-foreground">מביא את הפרחים ביום שישי בבוקר ומחלק לדוכנים.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="h-9" onClick={() => setOpen(true)}>
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          שיבוץ
        </Button>
      </div>
      {here.length === 0 ? (
        <p className="text-sm text-amber-700">עוד לא נקבע מי מביא את הפרחים.</p>
      ) : (
        <ShiftList shifts={here} names={f.names} />
      )}
      {open && (
        <PickDialog
          title="איסוף מהספק"
          f={f}
          type="supply"
          stallId={null}
          current={here}
          candidates={eligibleFor(f.data.employees.filter((e) => e.is_active), "supply")}
          meId={meId}
          onClose={() => setOpen(false)}
        />
      )}
    </section>
  );
}

/** The Yeruham courier for the whole week, picked in a dialog. */
export function CourierCard({ f, meId }: { f: FridayState; meId: string }) {
  const [open, setOpen] = React.useState(false);
  const [pick, setPick] = React.useState<string>("");
  const [saving, setSaving] = React.useState(false);
  const { toast } = useToast();
  if (!f.data) return null;
  const data = f.data;
  const current = data.courierId ? f.names.get(data.courierId) : null;
  const candidates = eligibleFor(data.employees.filter((e) => e.is_active), "courier");

  async function save() {
    setSaving(true);
    try {
      await opsFetch("/api/staff/schedule/courier", {
        method: "PUT",
        body: { week: data.weekStart, employee_id: pick || null },
      });
      toast({ title: pick ? "השליח נקבע" : "השליח הוסר", variant: "success" });
      setOpen(false);
      f.reload();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : T.saveError, variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border bg-background p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <Bike className="mt-0.5 h-5 w-5 text-amber-600" aria-hidden="true" />
          <div>
            <h3 className="font-semibold">שליח בירוחם</h3>
            <p className="text-xs text-muted-foreground">
              לשבוע {formatDate(data.weekStart)}–{formatDate(data.weekEnd)}. רואה ומוסר את כל המשלוחים של השבוע.
            </p>
            <p className={cn("mt-2 text-base font-medium", !current && "text-amber-700")}>{current ?? "עוד לא נבחר שליח"}</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-9"
          onClick={() => {
            setPick(data.courierId ?? "");
            setOpen(true);
          }}
        >
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          {current ? "החלפה" : "בחירת שליח"}
        </Button>
      </div>

      {open && (
        <FormSheet
          open
          onOpenChange={(o) => !o && !saving && setOpen(false)}
          title="מי השליח השבוע?"
          footer={
            <>
              <Button variant="outline" className="h-11 sm:h-10" onClick={() => setOpen(false)} disabled={saving}>
                {T.cancel}
              </Button>
              <Button className="h-11 sm:h-10" onClick={save} disabled={saving}>
                {saving ? T.saving : T.save}
              </Button>
            </>
          }
        >
          {candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">אין עובדים שמוגדרים כשליח. מוסיפים בדף העובדים.</p>
          ) : (
            <div className="space-y-2" role="radiogroup" aria-label="שליח">
              {[{ id: "", full_name: "בלי שליח" } as Pick<TeamMember, "id" | "full_name">, ...candidates].map((e) => (
                <label
                  key={e.id || "none"}
                  className={cn(
                    "flex min-h-12 cursor-pointer items-center gap-3 rounded-md border px-3 py-2",
                    pick === e.id && "border-primary bg-primary/5",
                  )}
                >
                  <input
                    type="radio"
                    name="courier"
                    className="h-4 w-4 accent-[hsl(var(--primary))]"
                    checked={pick === e.id}
                    onChange={() => setPick(e.id)}
                  />
                  <span className={cn(!e.id && "text-muted-foreground")}>
                    {e.full_name}
                    {e.id === meId && " (אני)"}
                  </span>
                </label>
              ))}
            </div>
          )}
        </FormSheet>
      )}
    </section>
  );
}

function ShiftList({ shifts, names }: { shifts: Shift[]; names: Map<string, string> }) {
  return (
    <ul className="space-y-1 text-sm">
      {shifts.map((s) => (
        <li key={s.id} className="flex justify-between gap-2">
          <span className="truncate font-medium">{names.get(s.employee_id) ?? "עובד"}</span>
          <span className="shrink-0 text-muted-foreground" dir="ltr">
            {hhmm(s.start_time)}–{hhmm(s.end_time)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Pick who works a Friday slot: tick people, set hours, save. Adds shifts for
 * newly ticked people and removes shifts of people who were unticked.
 */
function PickDialog({
  title,
  f,
  type,
  stallId,
  current,
  candidates,
  meId,
  onClose,
}: {
  title: string;
  f: FridayState;
  type: Extract<ShiftType, "stall" | "supply">;
  stallId: string | null;
  current: Shift[];
  candidates: TeamMember[];
  meId: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [picked, setPicked] = React.useState<Set<string>>(new Set(current.map((s) => s.employee_id)));
  const [start, setStart] = React.useState(current[0] ? hhmm(current[0].start_time) : DEFAULT_HOURS[type].start);
  const [end, setEnd] = React.useState(current[0] ? hhmm(current[0].end_time) : DEFAULT_HOURS[type].end);
  const [saving, setSaving] = React.useState(false);

  // People already in this slot stay listed even if they no longer qualify.
  const list = [
    ...candidates,
    ...current
      .filter((s) => !candidates.some((c) => c.id === s.employee_id))
      .map((s) => ({ id: s.employee_id, full_name: f.names.get(s.employee_id) ?? "עובד" }) as TeamMember),
  ];

  async function save() {
    if (end <= start) {
      toast({ title: "שעת הסיום חייבת להיות אחרי שעת ההתחלה", variant: "error" });
      return;
    }
    setSaving(true);
    try {
      const keep = new Set(picked);
      const toRemove = current.filter((s) => !keep.has(s.employee_id));
      const already = new Set(current.map((s) => s.employee_id));
      const toAdd = Array.from(keep).filter((id) => !already.has(id));
      const timesChanged = current.some((s) => hhmm(s.start_time) !== start || hhmm(s.end_time) !== end);
      for (const s of toRemove) await opsFetch(`/api/staff/schedule/${s.id}`, { method: "DELETE" });
      for (const id of toAdd) {
        await opsFetch("/api/staff/schedule", {
          method: "POST",
          body: { work_date: f.friday, start_time: start, end_time: end, shift_type: type, stall_id: stallId, employee_id: id },
        });
      }
      if (timesChanged) {
        for (const s of current.filter((s) => keep.has(s.employee_id))) {
          await opsFetch(`/api/staff/schedule/${s.id}`, {
            method: "PATCH",
            body: { work_date: s.work_date, start_time: start, end_time: end, shift_type: type, stall_id: stallId, employee_id: s.employee_id, notes: s.notes },
          });
        }
      }
      toast({ title: T.saved, variant: "success" });
      onClose();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : T.saveError, variant: "error" });
    } finally {
      setSaving(false);
      f.reload();
    }
  }

  return (
    <FormSheet
      open
      onOpenChange={(o) => !o && !saving && onClose()}
      title={title}
      footer={
        <>
          <Button variant="outline" className="h-11 sm:h-10" onClick={onClose} disabled={saving}>
            {T.cancel}
          </Button>
          <Button className="h-11 sm:h-10" onClick={save} disabled={saving}>
            {saving ? T.saving : T.save}
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted-foreground">
        {f.friday && `יום שישי ${formatDate(f.friday)}. `}מסמנים מי עובד ובאילו שעות.
      </p>
      <div className="flex items-center gap-2">
        <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="h-11 flex-1" aria-label="משעה" />
        <span className="text-muted-foreground">–</span>
        <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="h-11 flex-1" aria-label="עד שעה" />
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">אין עובדים מתאימים. מוסיפים עובדים בדף העובדים.</p>
      ) : (
        <div className="space-y-2">
          {list.map((e) => (
            <label key={e.id} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md border px-3 py-2">
              <Checkbox
                checked={picked.has(e.id)}
                onCheckedChange={(v) =>
                  setPicked((cur) => {
                    const next = new Set(cur);
                    if (v === true) next.add(e.id);
                    else next.delete(e.id);
                    return next;
                  })
                }
              />
              <span>
                {e.full_name}
                {e.id === meId && " (אני)"}
              </span>
            </label>
          ))}
        </div>
      )}
    </FormSheet>
  );
}

export { Store as StallIcon };
