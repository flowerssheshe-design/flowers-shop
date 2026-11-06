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
import { RequestsCard } from "./RequestsCard";

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
  /** Money really paid to me this calendar month. Null before migration 046. */
  paidThisMonth?: { total: number; payments: { id: string; week_start: string; amount: number; paid_at: string }[] } | null;
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

export function MyAreaView() {
  const { data, error, loading, reload } = useStaffData<Summary>("/api/staff/me/summary");

  if (loading && !data) return <LoadingBlock />;
  if (error && !data) return <ErrorBlock text={error} onRetry={() => void reload()} />;
  if (!data) return null;


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
        // Only money that was really paid, from the 1st of this month to its end.
        <Card title="שולם לי החודש">
          {data.paidThisMonth === null || data.paidThisMonth === undefined ? (
            <p className="text-sm text-muted-foreground">עוד אין כאן נתונים.</p>
          ) : (
            <>
              <p className="text-3xl font-bold tabular-nums">{formatILS(data.paidThisMonth.total)}</p>
              {data.paidThisMonth.payments.length === 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">עוד לא שולם לך החודש.</p>
              ) : (
                <ul className="mt-3 divide-y text-sm">
                  {data.paidThisMonth.payments.map((p) => (
                    <li key={p.id} className="flex justify-between gap-2 py-2">
                      <span>
                        {new Date(p.paid_at).toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem", day: "numeric", month: "numeric" })}
                        <span className="text-xs text-muted-foreground"> · על השבוע של {formatDate(p.week_start)}</span>
                      </span>
                      <span className="font-medium tabular-nums">{formatILS(p.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
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

      <RequestsCard />

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
