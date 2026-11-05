"use client";

import * as React from "react";
import { Lock, LockOpen, Package, Percent, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toaster";
import { T } from "@/lib/staff/labels";
import { cn } from "@/lib/utils";
import { opsFetch } from "@/lib/staff/ops/client";
import type { SplitMode } from "@/lib/staff/ops/stall-split";
import { Collapsible, ConfirmDialog, ErrorBlock, LoadingBlock, useOpsData } from "./common";

type SplitStall = { id: string; name: string; location: string | null; is_pickup_point: boolean; is_delivery_point?: boolean };
type SplitProduct = {
  id: string;
  title: string;
  live: number;
  plan: Record<string, number>;
  stallFree: Record<string, number>;
  pickups: Record<string, number>;
  undistributed: number;
  deliveryFree: number;
  orderable: number;
};
type SplitData = {
  week: string;
  mode: SplitMode;
  percents: Record<string, number>;
  lockedAt: string | null;
  lockAt: string;
  stalls: SplitStall[];
  products: SplitProduct[];
  canEdit?: boolean;
};

const SPLIT_URL = "/api/staff/inventory/split";

function when(iso: string) {
  return new Date(iso).toLocaleString("he-IL", {
    timeZone: "Asia/Jerusalem",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * How the week's bouquets are split between the stalls: a number per stall or
 * percents. The website keeps selling from the whole stock; a pickup order
 * comes off the stall the customer chose. Locks on Thursday evening.
 */
export function StallSplitPanel({ onChanged }: { onChanged?: () => void }) {
  const { data, error, loading, reload, setData } = useOpsData<SplitData>(SPLIT_URL, (u) => opsFetch(u));
  const [percents, setPercents] = React.useState<Record<string, string>>({});
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const [confirm, setConfirm] = React.useState<"lock" | "unlock" | null>(null);
  const { toast } = useToast();

  React.useEffect(() => {
    if (!data) return;
    setPercents(Object.fromEntries(data.stalls.map((s) => [s.id, data.percents[s.id] ? String(data.percents[s.id]) : ""])));
    setDrafts({});
  }, [data]);

  if (loading && !data) return <LoadingBlock />;
  if (error && !data) return <ErrorBlock message={error} onRetry={reload} />;
  if (!data) return null;

  const canEdit = data.canEdit === true;
  const locked = Boolean(data.lockedAt);
  const editable = canEdit && !locked;
  const stalls = data.stalls;
  const percentSum = stalls.reduce((s, st) => s + (Number(percents[st.id]) || 0), 0);
  const noPercents = stalls.every((st) => !(Number(percents[st.id]) > 0));
  const percentsDirty = stalls.some((st) => (Number(percents[st.id]) || 0) !== (data.percents[st.id] || 0));

  async function run(fn: () => Promise<SplitData | void>, done?: string) {
    setBusy(true);
    try {
      const next = await fn();
      if (next) setData((d) => ({ ...next, canEdit: d?.canEdit }));
      else await reload();
      if (done) toast({ title: done, variant: "success" });
      onChanged?.();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : T.saveError, variant: "error" });
      await reload();
    } finally {
      setBusy(false);
    }
  }

  const setMode = (mode: SplitMode) =>
    run(() => opsFetch<SplitData>(SPLIT_URL, { method: "PUT", body: { mode } }), mode === "count" ? "חלוקה לפי כמות" : "חלוקה לפי אחוזים");

  const savePercents = () =>
    run(
      () =>
        opsFetch<SplitData>(SPLIT_URL, {
          method: "PUT",
          body: {
            mode: "percent",
            percents: Object.fromEntries(stalls.map((s) => [s.id, Number(percents[s.id]) || 0]).filter(([, v]) => (v as number) > 0)),
          },
        }),
      "האחוזים נשמרו",
    );

  const saveCount = (p: SplitProduct, st: SplitStall) => {
    const key = `${p.id}:${st.id}`;
    const raw = drafts[key];
    if (raw === undefined) return;
    const qty = Math.max(0, Math.floor(Number(raw) || 0));
    if (qty === (p.plan[st.id] ?? 0)) {
      setDrafts((d) => {
        const { [key]: _drop, ...rest } = d;
        return rest;
      });
      return;
    }
    void run(async () => {
      await opsFetch("/api/staff/inventory/stalls", { method: "PUT", body: { product_id: p.id, stall_id: st.id, qty } });
    });
  };

  const lockOrUnlock = (lock: boolean) =>
    run(() => opsFetch<SplitData>(SPLIT_URL, { method: "POST", body: { locked: lock } }), lock ? "החלוקה ננעלה" : "החלוקה נפתחה");

  const summary = `${data.mode === "count" ? "לפי כמות" : "לפי אחוזים"} · ${
    locked ? `ננעל (${when(data.lockedAt!)})` : `ננעל אוטומטית ב${when(data.lockAt)}`
  }`;

  return (
    <Collapsible
      id="stall-split"
      title="חלוקת זרים בין הדוכנים"
      summary={summary}
      icon={<Package className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />}
      className={cn(busy && "opacity-70")}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          האתר ממשיך למכור מכל המלאי. הזמנה לאיסוף יורדת מהדוכן שהלקוח בחר, ומשלוח יורד מדוכן שהוא נקודת משלוחים. דוכן שנגמר בו זר לא יופיע להזמנה של הזר הזה.
        </p>
        {locked ? (
          <Badge className="gap-1">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            ננעל ({when(data.lockedAt!)})
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1">
            <LockOpen className="h-3.5 w-3.5" aria-hidden="true" />
            ננעל אוטומטית ב{when(data.lockAt)}
          </Badge>
        )}
      </div>

      {locked && (
        <p className="mb-3 rounded-md border border-primary/30 bg-primary/5 p-2 text-sm">
          הזרים כבר בדוכנים ולא עוברים ביניהם. כל מכירה או הזמנה לאיסוף יורדת רק מהדוכן שלה.
        </p>
      )}

      {stalls.length === 0 ? (
        <p className="text-sm text-muted-foreground">אין דוכנים פעילים.</p>
      ) : (
        <>
          {/* Mode */}
          <div className="mb-3 grid grid-cols-2 gap-2 sm:max-w-md" role="radiogroup" aria-label="שיטת חלוקה">
            {(
              [
                ["count", "כמות לכל דוכן", Hash],
                ["percent", "לפי אחוזים", Percent],
              ] as const
            ).map(([m, label, Icon]) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={data.mode === m}
                disabled={!editable || busy || data.mode === m}
                onClick={() => setMode(m)}
                className={cn(
                  "flex min-h-11 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium",
                  data.mode === m ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent",
                  !editable && data.mode !== m && "opacity-50",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>

          {data.mode === "percent" && (
            <div className="mb-3 rounded-md bg-muted/40 p-3">
              <p className="mb-2 text-xs text-muted-foreground">
                מה שנשאר אחרי ההזמנות מתחלק לפי האחוזים, וכל דוכן מקבל בנוסף את ההזמנות שנאספות אצלו.
                {noPercents && " בלי אחוזים: חלוקה שווה."}
                {stalls.some((st) => st.is_delivery_point)
                  ? " המשלוחים יוצאים מהדוכן שהוא נקודת משלוחים."
                  : " מה שלא חולק (מתחת ל-100%) נשאר למשלוחים."}
              </p>
              <div className="flex flex-wrap items-end gap-3">
                {stalls.map((st) => (
                  <label key={st.id} className="text-sm">
                    <span className="mb-1 block">{st.name}</span>
                    <span className="flex items-center gap-1">
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={100}
                        dir="ltr"
                        className="h-11 w-20 text-center tabular-nums"
                        value={percents[st.id] ?? ""}
                        placeholder={noPercents ? String(Math.round(100 / stalls.length)) : "0"}
                        disabled={!editable || busy}
                        onChange={(e) => setPercents((p) => ({ ...p, [st.id]: e.target.value }))}
                        aria-label={`אחוז ל${st.name}`}
                      />
                      %
                    </span>
                  </label>
                ))}
                {editable && (
                  <Button className="h-11" onClick={savePercents} disabled={busy || !percentsDirty || percentSum > 100}>
                    {T.save}
                  </Button>
                )}
              </div>
              {percentSum > 100 && <p className="mt-2 text-sm text-destructive">סך האחוזים {percentSum}%. אפשר עד 100%.</p>}
            </div>
          )}

          {data.mode === "count" && editable && (
            <p className="mb-2 text-xs text-muted-foreground">
              רושמים כמה מכל זר כל דוכן מקבל (כולל ההזמנות שיוצאות ממנו).
              {stalls.some((st) => st.is_delivery_point) ? " המשלוחים יוצאים מהדוכן שהוא נקודת משלוחים." : " מה שלא חולק נשאר למשלוחים."}
            </p>
          )}

          {/* Per bouquet */}
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-right text-xs text-muted-foreground">
                <tr>
                  <th className="p-2 font-medium">זר</th>
                  <th className="p-2 font-medium">במלאי</th>
                  {stalls.map((st) => (
                    <th key={st.id} className="p-2 font-medium">
                      {st.name}
                      {(st.is_pickup_point || st.is_delivery_point) && (
                        <span className="block font-normal">
                          {[st.is_pickup_point && "איסוף", st.is_delivery_point && "משלוחים"].filter(Boolean).join(" + ")}
                        </span>
                      )}
                    </th>
                  ))}
                  <th className="p-2 font-medium">לא חולק</th>
                </tr>
              </thead>
              <tbody>
                {data.products.map((p) => (
                  <tr key={p.id} className="border-t align-top">
                    <td className="p-2 font-medium">{p.title}</td>
                    <td className={cn("p-2 tabular-nums", p.live === 0 && "text-destructive")}>{p.live}</td>
                    {stalls.map((st) => {
                      const free = p.stallFree[st.id] ?? 0;
                      const orders = p.pickups[st.id] ?? 0;
                      const key = `${p.id}:${st.id}`;
                      return (
                        <td key={st.id} className="p-2">
                          {data.mode === "count" && editable ? (
                            <Input
                              type="number"
                              inputMode="numeric"
                              min={0}
                              dir="ltr"
                              className="h-10 w-20 text-center tabular-nums"
                              value={drafts[key] ?? String(p.plan[st.id] ?? 0)}
                              disabled={busy}
                              onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                              onBlur={() => saveCount(p, st)}
                              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                              aria-label={`כמה ${p.title} ל${st.name}`}
                            />
                          ) : null}
                          <span className={cn("block tabular-nums", data.mode === "count" && editable ? "mt-1 text-xs" : "font-semibold", free === 0 && "text-amber-700")}>
                            {data.mode === "count" && editable ? `פנוי: ${free}` : free}
                          </span>
                          {orders > 0 && <span className="block text-xs text-muted-foreground">+{orders} להזמנות</span>}
                        </td>
                      );
                    })}
                    <td className="p-2 tabular-nums text-muted-foreground">{p.undistributed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {canEdit && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {locked
                  ? "פתיחה מחדש מבטלת את המלאי הקבוע בדוכנים. החלוקה תישאר פתוחה עד שתנעלו שוב."
                  : "בנעילה כל דוכן מקבל מלאי קבוע, והזרים כבר לא עוברים בין הדוכנים."}
              </p>
              <Button variant={locked ? "outline" : "default"} className="h-11" disabled={busy} onClick={() => setConfirm(locked ? "unlock" : "lock")}>
                {locked ? <LockOpen className="h-4 w-4" aria-hidden="true" /> : <Lock className="h-4 w-4" aria-hidden="true" />}
                {locked ? "פתיחת החלוקה מחדש" : "נעילה עכשיו"}
              </Button>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirm !== null}
        title={confirm === "lock" ? "לנעול את החלוקה עכשיו?" : "לפתוח את החלוקה מחדש?"}
        description={
          confirm === "lock"
            ? "כל דוכן יקבל את הכמות שמוצגת עכשיו, והזרים לא יעברו יותר בין הדוכנים."
            : "המלאי הקבוע בדוכנים יבוטל והחלוקה תחושב מחדש. לא לעשות את זה בזמן שהדוכנים מוכרים."
        }
        confirmLabel={confirm === "lock" ? "נעילה" : "פתיחה"}
        busy={busy}
        onConfirm={() => {
          const lock = confirm === "lock";
          setConfirm(null);
          void lockOrUnlock(lock);
        }}
        onCancel={() => setConfirm(null)}
      />
    </Collapsible>
  );
}
