"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { OT, phaseLabel } from "@/lib/staff/owner/labels";
import type { DashboardData } from "@/lib/staff/owner/week-math";
import { fmtDateTime, fmtWeek } from "../shared";

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return "עכשיו";
  const totalMin = Math.floor(ms / 60000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days} ימים ו-${hours} שעות`;
  if (hours > 0) return `${hours} שעות ו-${mins} דקות`;
  return `${mins} דקות`;
}

export function WeekBar({
  week,
  openToday,
  storeMode,
}: {
  week: DashboardData["week"];
  openToday: DashboardData["openToday"];
  storeMode: { mode: string; setting: string };
}) {
  const now = useNow(30_000);
  const msLeft = new Date(week.supplierOrderAt).getTime() - now;
  const isPre = week.phase === "preorder";
  const overridden = storeMode.setting !== "auto";

  return (
    <div className="mb-4 grid gap-3 rounded-xl border bg-card p-4 shadow-sm sm:grid-cols-3">
      <div>
        <div className="text-xs text-muted-foreground">שבוע {fmtWeek(week.weekStart, week.weekEnd)}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Badge className={cn(isPre ? "bg-blue-100 text-blue-800 hover:bg-blue-100" : "bg-emerald-100 text-emerald-800 hover:bg-emerald-100")}>
            {phaseLabel(week.phase)}
          </Badge>
          {overridden && (
            <Link href="/staff/settings" className="text-xs text-amber-700 underline">
              {storeMode.mode === "realtime" ? "החנות במכירה בלייב (ידני)" : "החנות בהזמנה מראש (ידני)"}
            </Link>
          )}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {OT.dashboard.weekCloses}: {fmtDateTime(week.closesAt)}
        </div>
      </div>

      <div className="flex items-start gap-2">
        {week.supplierOrderedAt ? (
          <>
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div>
              <div className="font-medium">{OT.dashboard.supplierSent}</div>
              <div className="text-xs text-muted-foreground">{fmtDateTime(week.supplierOrderedAt)}</div>
            </div>
          </>
        ) : (
          <>
            <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <div className="font-medium">
                {isPre ? `${OT.dashboard.untilSupplier}: ${formatCountdown(msLeft)}` : OT.dashboard.supplierNotSent}
              </div>
              <div className="text-xs text-muted-foreground">{fmtDateTime(week.supplierOrderAt)}</div>
              <Link href="/staff/supplier" className="text-xs font-medium text-primary underline">
                למסך ההזמנה מהספק
              </Link>
            </div>
          </>
        )}
      </div>

      <div className="flex items-start gap-2">
        <Store className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div>
          <div className="font-medium">{OT.dashboard.openToday}</div>
          <div className="text-sm text-muted-foreground">
            {openToday.length ? openToday.map((s) => s.name).join(", ") : OT.dashboard.nothingOpen}
          </div>
        </div>
      </div>
    </div>
  );
}
