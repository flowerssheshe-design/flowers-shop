"use client";

import { useState } from "react";
import { CalendarDays, Clock, KeyRound, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatILS } from "@/lib/utils";
import { T } from "@/lib/staff/labels";
import { W } from "@/lib/staff/work/labels";
import { api, formatDate, useStaffData } from "@/lib/staff/work/client";
import { checkPinChangeInput } from "@/lib/staff/work/pin-change";
import { Card, EmptyBlock, ErrorBlock, LoadingBlock, Stat } from "./common";

type ShiftView = {
  id: string;
  work_date: string;
  start_time: string;
  end_time: string;
  shift_type: string;
  stall_name: string | null;
  notes: string | null;
  hours: number;
};

type EarningsView = {
  hours: number;
  shifts: number;
  deliveries: number;
  amount: number;
  fromBudget: number;
  fromResponsibility?: number;
  /** One-off payments (bonus) included in amount. */
  fromEntries?: number;
};

type Summary = {
  isOwner: boolean;
  today: string;
  week: { start: string; end: string };
  pay: { pay_type: string | null; pay_rate: number | null; responsibility_pay?: number | null } | null;
  earnings: { week: EarningsView; month: EarningsView } | null;
  hours: { week: number; month: number };
  shifts: { thisWeek: ShiftView[]; nextWeek: ShiftView[] };
};

function hoursText(h: number) {
  return Number.isInteger(h) ? String(h) : h.toFixed(1);
}

function ShiftList({ shifts, today }: { shifts: ShiftView[]; today: string }) {
  if (shifts.length === 0) return <EmptyBlock text={W.noShifts} />;
  return (
    <ul className="space-y-2">
      {shifts.map((s) => {
        const isToday = s.work_date === today;
        const past = s.work_date < today;
        return (
          <li
            key={s.id}
            className={`rounded-lg border p-3 ${isToday ? "border-primary bg-primary/5" : ""} ${past ? "opacity-60" : ""}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">
                {formatDate(s.work_date)}
                {isToday && <span className="mr-2 rounded bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">{T.today}</span>}
              </p>
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
                {W.shiftType[s.shift_type] ?? s.shift_type}
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1" dir="ltr">
                <Clock className="h-4 w-4" aria-hidden="true" />
                {s.start_time}–{s.end_time}
              </span>
              {s.stall_name && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-4 w-4" aria-hidden="true" />
                  {s.stall_name}
                </span>
              )}
              <span>
                {hoursText(s.hours)} {W.hours}
              </span>
            </div>
            {s.notes && <p className="mt-1 text-sm">{s.notes}</p>}
          </li>
        );
      })}
    </ul>
  );
}

function EarningsCard({ title, e, showDeliveries }: { title: string; e: EarningsView; showDeliveries: boolean }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{formatILS(e.amount)}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {hoursText(e.hours)} {W.hours} · {e.shifts} {W.shiftsCount}
        {showDeliveries && ` · ${e.deliveries} ${W.deliveriesCount}`}
      </p>
      {e.fromEntries ? (
        <p className="mt-1 text-xs text-muted-foreground">כולל תשלום חד-פעמי של {formatILS(e.fromEntries)}</p>
      ) : null}
    </div>
  );
}

export function MyAreaView() {
  const { data, error, loading, reload } = useStaffData<Summary>("/api/staff/me/summary");

  if (loading && !data) return <LoadingBlock />;
  if (error && !data) return <ErrorBlock text={error} onRetry={() => void reload()} />;
  if (!data) return null;

  const pay = data.pay;
  const showDeliveries = pay?.pay_type === "per_delivery" || (data.earnings?.month.deliveries ?? 0) > 0;

  return (
    <div className="space-y-4">
      {data.isOwner ? (
        <Card title={W.hours}>
          <div className="grid grid-cols-2 gap-2">
            <Stat label={W.earnedWeek} value={hoursText(data.hours.week)} />
            <Stat label={W.earnedMonth} value={hoursText(data.hours.month)} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{W.ownerNoPay}</p>
        </Card>
      ) : (
        <Card title={W.earnings}>
          {data.earnings && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <EarningsCard title={W.earnedWeek} e={data.earnings.week} showDeliveries={showDeliveries} />
              <EarningsCard title={W.earnedMonth} e={data.earnings.month} showDeliveries={showDeliveries} />
            </div>
          )}
          <div className="mt-3 space-y-1 text-sm">
            <p className="text-muted-foreground">
              על עבודה בדוכן ובמשלוחים מנהל המשמרות קובע כמה תקבל השבוע.
              {data.earnings && data.earnings.week.fromBudget === 0 && " השבוע עוד לא נקבע."}
            </p>
            {pay?.pay_type && pay.pay_type !== "per_delivery" && pay.pay_rate !== null && (
              <p>
                {W.myRate} לאיסוף מהספק: <strong>{formatILS(pay.pay_rate)}</strong> {T.payType[pay.pay_type] ?? ""}
              </p>
            )}
            {pay?.responsibility_pay ? (
              <p>
                על האחריות: <strong>{formatILS(pay.responsibility_pay)}</strong> לשבוע
              </p>
            ) : null}
          </div>
        </Card>
      )}

      <Card
        title={
          <span className="inline-flex items-center gap-2">
            <CalendarDays className="h-5 w-5" aria-hidden="true" />
            {W.thisWeekShifts}
          </span>
        }
      >
        <ShiftList shifts={data.shifts.thisWeek} today={data.today} />
      </Card>

      <Card title={W.nextWeekShifts}>
        <ShiftList shifts={data.shifts.nextWeek} today={data.today} />
      </Card>

      <PinChangeCard />
    </div>
  );
}

/** The employee changes their own login PIN. */
function PinChangeCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    const input = { current_pin: current, new_pin: next, new_pin_confirm: confirm };
    const invalid = checkPinChangeInput(input);
    if (invalid) return setError(invalid);
    setBusy(true);
    try {
      await api("/api/staff/me/pin", { method: "POST", json: input });
      setCurrent("");
      setNext("");
      setConfirm("");
      setDone(true);
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : T.saveError);
    } finally {
      setBusy(false);
    }
  }

  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 8);
  const field = (id: string, label: string, value: string, set: (v: string) => void, autoComplete: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete={autoComplete}
        dir="ltr"
        maxLength={8}
        className="h-12 text-lg tracking-widest"
        value={value}
        onChange={(e) => {
          set(digits(e.target.value));
          setDone(false);
        }}
      />
    </div>
  );

  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          <KeyRound className="h-5 w-5" aria-hidden="true" />
          שינוי קוד אישי
        </span>
      }
    >
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-muted-foreground">הקוד שאיתו נכנסים למערכת. 4 עד 8 ספרות.</p>
        {field("pin-current", "הקוד הנוכחי", current, setCurrent, "current-password")}
        {field("pin-new", "קוד חדש", next, setNext, "new-password")}
        {field("pin-confirm", "הקוד החדש שוב", confirm, setConfirm, "new-password")}
        {error && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        )}
        {done && (
          <p role="status" className="text-sm font-medium text-primary">
            הקוד הוחלף. בכניסה הבאה הקלידו את הקוד החדש.
          </p>
        )}
        <Button type="submit" className="h-12 w-full" disabled={busy}>
          {busy ? T.saving : "שמירת קוד חדש"}
        </Button>
      </form>
    </Card>
  );
}
