"use client";

import * as React from "react";
import { Equal, Lock, LockOpen, Package, Save, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toaster";
import { T } from "@/lib/staff/labels";
import { cn } from "@/lib/utils";
import { opsFetch } from "@/lib/staff/ops/client";
import { equalDistribution, type SplitMode } from "@/lib/staff/ops/stall-split";
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
  resetAt?: string | null;
  resetNote?: string | null;
  stalls: SplitStall[];
  products: SplitProduct[];
  canEdit?: boolean;
};

/** productId → stallId → what is typed in the field. */
type Drafts = Record<string, Record<string, string>>;

const SPLIT_URL = "/api/staff/inventory/split";

function when(iso: string) {
  return new Date(iso).toLocaleString("he-IL", {
    timeZone: "Asia/Jerusalem",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const num = (v: string | undefined) => Math.max(0, Math.floor(Number(v) || 0));

function draftsFrom(data: SplitData): Drafts {
  return Object.fromEntries(
    data.products.map((p) => [p.id, Object.fromEntries(data.stalls.map((s) => [s.id, String(p.stallFree[s.id] ?? 0)]))]),
  );
}

/**
 * How the week's free bouquets are split between the stalls. The manager types
 * every number (or fills them with "equal split"), then saves once. The orders
 * taken from a stall come on top of its share. Locked only by hand.
 */
export function StallSplitPanel({ onChanged }: { onChanged?: () => void }) {
  const { data, error, loading, reload, setData } = useOpsData<SplitData>(SPLIT_URL, (u) => opsFetch(u));
  const [drafts, setDrafts] = React.useState<Drafts>({});
  const [busy, setBusy] = React.useState(false);
  const [confirm, setConfirm] = React.useState<"lock" | "unlock" | null>(null);
  const { toast } = useToast();

  React.useEffect(() => {
    if (data) setDrafts(draftsFrom(data));
  }, [data]);

  if (loading && !data) return <LoadingBlock />;
  if (error && !data) return <ErrorBlock message={error} onRetry={reload} />;
  if (!data) return null;

  const canEdit = data.canEdit === true;
  const locked = Boolean(data.lockedAt);
  // Also after the lock: then a change moves bouquets between the stalls.
  const editable = canEdit;
  const saved = data.mode === "count";
  const stalls = data.stalls;

  const valueOf = (p: SplitProduct, sid: string) => drafts[p.id]?.[sid] ?? String(p.stallFree[sid] ?? 0);
  const sumOf = (p: SplitProduct) => stalls.reduce((s, st) => s + num(valueOf(p, st.id)), 0);
  const dirty = data.products.some((p) => stalls.some((st) => num(valueOf(p, st.id)) !== (p.stallFree[st.id] ?? 0)));
  const over = data.products.filter((p) => sumOf(p) > p.live);

  async function run(fn: () => Promise<SplitData>, done: string) {
    setBusy(true);
    try {
      const next = await fn();
      setData((d) => ({ ...next, canEdit: d?.canEdit }));
      toast({ title: done, variant: "success" });
      onChanged?.();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : T.saveError, variant: "error" });
      await reload();
    } finally {
      setBusy(false);
    }
  }

  const quickSplit = () => {
    const dist = equalDistribution(
      stalls.map((s) => s.id),
      data.products,
    );
    setDrafts(Object.fromEntries(Object.entries(dist).map(([pid, row]) => [pid, Object.fromEntries(Object.entries(row).map(([sid, n]) => [sid, String(n)]))])));
  };

  const save = () =>
    run(
      () =>
        opsFetch<SplitData>(SPLIT_URL, {
          method: "PUT",
          body: {
            distribution: Object.fromEntries(
              data.products.map((p) => [p.id, Object.fromEntries(stalls.map((st) => [st.id, num(valueOf(p, st.id))]))]),
            ),
            // What was on screen: after the lock only the changes are applied (a sale meanwhile isn't lost).
            seen: Object.fromEntries(data.products.map((p) => [p.id, Object.fromEntries(stalls.map((st) => [st.id, p.stallFree[st.id] ?? 0]))])),
          },
        }),
      locked ? "הזרים הועברו" : "החלוקה נשמרה",
    );

  const lockOrUnlock = (lock: boolean) =>
    run(() => opsFetch<SplitData>(SPLIT_URL, { method: "POST", body: { locked: lock } }), lock ? "החלוקה ננעלה" : "החלוקה נפתחה");

  /** One stall's share of one bouquet: the field (or the number when it can't be edited) and its orders. */
  const shareCell = (p: SplitProduct, st: SplitStall, wide = false) => {
    const orders = p.pickups[st.id] ?? 0;
    const share = num(valueOf(p, st.id));
    return (
      <>
        {editable ? (
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            dir="ltr"
            className={cn("text-center tabular-nums", wide ? "h-11 w-full text-base" : "h-10 w-20")}
            value={valueOf(p, st.id)}
            disabled={busy}
            onFocus={(e) => e.target.select()}
            onChange={(e) => {
              const v = e.target.value;
              setDrafts((d) => ({ ...d, [p.id]: { ...d[p.id], [st.id]: v } }));
            }}
            aria-label={`כמה ${p.title} ל${st.name}`}
          />
        ) : (
          <span className={cn("block font-semibold tabular-nums", wide && "text-base", share === 0 && "text-amber-700")}>{share}</span>
        )}
        {orders > 0 && (
          <span className="mt-1 block text-xs text-muted-foreground">
            +{orders} להזמנות · סה״כ {share + orders}
          </span>
        )}
      </>
    );
  };

  /** Everything that goes out to one stall (what is typed now, plus its orders). */
  const stallTotal = (st: SplitStall) =>
    data.products.reduce(
      (t, p) => {
        const orders = p.pickups[st.id] ?? 0;
        return { all: t.all + num(valueOf(p, st.id)) + orders, orders: t.orders + orders };
      },
      { all: 0, orders: 0 },
    );
  const totalLive = data.products.reduce((t, p) => t + p.live, 0);
  const totalOrdered = data.products.reduce((t, p) => t + stalls.reduce((s, st) => s + (p.pickups[st.id] ?? 0), 0), 0);
  const totalLeft = data.products.reduce((t, p) => t + p.live - sumOf(p), 0);

  const summary =
    data.resetAt && !locked
      ? "⚠ צריך לחלק מחדש: מה שהגיע מהספק השתנה"
      : locked
        ? `ננעל (${when(data.lockedAt!)})`
        : saved
          ? "נשמרה חלוקה · עוד לא ננעל"
          : "עוד לא נשמרה חלוקה (כרגע: חלוקה שווה)";

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
          מחלקים רק את מה שפנוי. כל דוכן מקבל בנוסף את הזרים של ההזמנות שיוצאות ממנו (איסוף{stalls.some((st) => st.is_delivery_point) ? " או משלוח" : ""}).
          {!stalls.some((st) => st.is_delivery_point) && " מה שלא חולק נשאר למשלוחים."}
        </p>
        {locked ? (
          <Badge className="gap-1">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            ננעל ({when(data.lockedAt!)})
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1">
            <LockOpen className="h-3.5 w-3.5" aria-hidden="true" />
            פתוח עד שמנהל נועל
          </Badge>
        )}
      </div>

      {!locked && data.resetAt && (
        <p className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
          <b>צריך לחלק מחדש.</b> {data.resetNote} החלוקה הקודמת בוטלה. חלקו, שמרו, ואז לחצו &quot;נעילה עכשיו&quot;.
        </p>
      )}

      {locked && (
        <p className="mb-3 rounded-md border border-primary/30 bg-primary/5 p-2 text-sm">
          הזרים כבר בדוכנים. כל מכירה או הזמנה לאיסוף יורדת רק מהדוכן שלה. אפשר עדיין להעביר זרים בין הדוכנים: משנים את המספרים ושומרים.
        </p>
      )}

      {stalls.length === 0 ? (
        <p className="text-sm text-muted-foreground">אין דוכנים פעילים.</p>
      ) : (
        <>
          {editable && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Button variant="outline" className="h-11" onClick={quickSplit} disabled={busy}>
                <Equal className="h-4 w-4" aria-hidden="true" />
                חלוקה שווה ({Math.round(100 / stalls.length)}% לכל דוכן)
              </Button>
              {dirty && (
                <Button variant="ghost" className="h-11" onClick={() => setDrafts(draftsFrom(data))} disabled={busy}>
                  <Undo2 className="h-4 w-4" aria-hidden="true" />
                  ביטול שינויים
                </Button>
              )}
              <Button className="h-11 ms-auto" onClick={save} disabled={busy || (!dirty && (saved || locked)) || over.length > 0}>
                <Save className="h-4 w-4" aria-hidden="true" />
                {T.save}
              </Button>
            </div>
          )}
          {editable && over.length > 0 && (
            <p className="mb-2 text-sm text-destructive">
              חולק יותר ממה שיש: {over.map((p) => p.title).join(", ")}. תקנו לפני השמירה.
            </p>
          )}

          {/* Phone: a card per bouquet, the stalls side by side (no sideways scrolling). */}
          <ul className="space-y-2 sm:hidden">
            {data.products.map((p) => {
              const ordered = stalls.reduce((s, st) => s + (p.pickups[st.id] ?? 0), 0);
              const left = p.live - sumOf(p);
              return (
                <li key={p.id} className="rounded-md border p-3">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <span className="font-medium">{p.title}</span>
                    <span className="shrink-0 text-end text-xs text-muted-foreground">
                      לחלוקה <b className={cn("text-sm tabular-nums text-foreground", p.live === 0 && "text-destructive")}>{p.live}</b>
                      {" · "}נשאר{" "}
                      <b dir="ltr" className={cn("text-sm tabular-nums", left < 0 ? "text-destructive" : "text-foreground")}>
                        {left}
                      </b>
                      {ordered > 0 && <span className="block">+{ordered} בהזמנות</span>}
                    </span>
                  </div>
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(5rem,1fr))] gap-2">
                    {stalls.map((st) => (
                      <label key={st.id} className="block text-xs text-muted-foreground">
                        <span className="mb-1 block truncate">{st.name}</span>
                        {shareCell(p, st, true)}
                      </label>
                    ))}
                  </div>
                </li>
              );
            })}
            <li className="rounded-md border border-primary/30 bg-primary/5 p-3">
              <p className="mb-2 font-medium">סה״כ לכל דוכן</p>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(5rem,1fr))] gap-2">
                {stalls.map((st) => {
                  const t = stallTotal(st);
                  return (
                    <div key={st.id} className="text-xs text-muted-foreground">
                      <span className="mb-1 block truncate">{st.name}</span>
                      <b className="block text-lg tabular-nums text-foreground">{t.all}</b>
                      {t.orders > 0 && <span className="block">מתוכם {t.orders} להזמנות</span>}
                    </div>
                  );
                })}
              </div>
            </li>
          </ul>

          <div className="hidden overflow-x-auto rounded-md border sm:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-right text-xs text-muted-foreground">
                <tr>
                  <th className="p-2 font-medium">זר</th>
                  <th className="p-2 font-medium">לחלוקה</th>
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
                  <th className="p-2 font-medium">נשאר</th>
                </tr>
              </thead>
              <tbody>
                {data.products.map((p) => {
                  const ordered = stalls.reduce((s, st) => s + (p.pickups[st.id] ?? 0), 0);
                  const left = p.live - sumOf(p);
                  return (
                    <tr key={p.id} className="border-t align-top">
                      <td className="p-2 font-medium">{p.title}</td>
                      <td className="p-2">
                        <span className={cn("block font-semibold tabular-nums", p.live === 0 && "text-destructive")}>{p.live}</span>
                        {ordered > 0 && <span className="block text-xs text-muted-foreground">+{ordered} בהזמנות</span>}
                      </td>
                      {stalls.map((st) => (
                        <td key={st.id} className="p-2">
                          {shareCell(p, st)}
                        </td>
                      ))}
                      <td className={cn("p-2 tabular-nums", left < 0 ? "font-semibold text-destructive" : "text-muted-foreground")}>
                        <span dir="ltr">{left}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 bg-muted/50 align-top">
                <tr>
                  <td className="p-2 font-semibold">סה״כ לדוכן</td>
                  <td className="p-2">
                    <span className="block font-semibold tabular-nums">{totalLive}</span>
                    {totalOrdered > 0 && <span className="block text-xs text-muted-foreground">+{totalOrdered} בהזמנות</span>}
                  </td>
                  {stalls.map((st) => {
                    const t = stallTotal(st);
                    return (
                      <td key={st.id} className="p-2">
                        <span className="block text-base font-bold tabular-nums">{t.all}</span>
                        {t.orders > 0 && <span className="block text-xs text-muted-foreground">מתוכם {t.orders} להזמנות</span>}
                      </td>
                    );
                  })}
                  <td className={cn("p-2 tabular-nums", totalLeft < 0 ? "font-semibold text-destructive" : "text-muted-foreground")}>
                    <span dir="ltr">{totalLeft}</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {canEdit && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {locked
                  ? "פתיחה מחדש מבטלת את המלאי הקבוע בדוכנים. החלוקה תישאר פתוחה עד שתנעלו שוב."
                  : dirty
                    ? "יש שינויים שלא נשמרו. שמרו לפני הנעילה."
                    : "החלוקה לא ננעלת לבד. בנעילה כל דוכן מקבל מלאי קבוע, ומאז הזרים עוברים בין הדוכנים רק כשמנהל משנה כאן."}
              </p>
              <Button
                variant={locked ? "outline" : "default"}
                className="h-11"
                disabled={busy || (!locked && dirty)}
                onClick={() => setConfirm(locked ? "unlock" : "lock")}
              >
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
            ? "כל דוכן יקבל את הכמות שמוצגת עכשיו (ועוד ההזמנות שלו). אחר כך אפשר עדיין להעביר זרים בין הדוכנים מכאן."
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
