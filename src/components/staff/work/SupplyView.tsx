"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, MapPin, Truck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { T } from "@/lib/staff/labels";
import { W } from "@/lib/staff/work/labels";
import { api, useStaffData } from "@/lib/staff/work/client";
import { validateDistribution, type DistributionProduct } from "@/lib/staff/work/distribution";
import { QtyStepper } from "./QtyStepper";
import { Card, EmptyBlock, ErrorBlock, LoadingBlock, NoticeBlock, RefreshButton } from "./common";

type SupplyData = {
  /** The Friday the stalls work this week. */
  friday?: string;
  /** Owners and ops managers: link to the stock page, where the split is set. */
  canManage?: boolean;
  /** Owners and ops managers save the distribution; others only see it. */
  canDistribute?: boolean;
  week: { start: string; end: string; phase: string };
  source: "supplier" | "forecast";
  lines: { product_id: string; title: string; qty: number; picked_up: boolean }[];
  products: { id: string; title: string; image_url: string | null; stock: number | null }[];
  stalls: { id: string; name: string; location: string | null }[];
  scheduled: Record<string, { name: string; start_time: string; end_time: string }[]>;
  distributedToday: Record<string, Record<string, number>>;
};

type Tab = "pickup" | "distribute";

function forecastKey(weekStart: string) {
  return `staff.supply.forecast-picked.${weekStart}`;
}

function readForecastPicked(weekStart: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(forecastKey(weekStart));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function PickupList({ data, onChanged }: { data: SupplyData; onChanged: () => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [localPicked, setLocalPicked] = useState<Set<string>>(new Set());
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});
  const isForecast = data.source === "forecast";

  useEffect(() => {
    if (isForecast) setLocalPicked(readForecastPicked(data.week.start));
  }, [isForecast, data.week.start]);

  useEffect(() => setOptimistic({}), [data.lines]);

  const isPicked = (l: SupplyData["lines"][number]) =>
    isForecast ? localPicked.has(l.product_id) : (optimistic[l.product_id] ?? l.picked_up);

  async function toggle(l: SupplyData["lines"][number]) {
    const next = !isPicked(l);
    if (isForecast) {
      const set = new Set(localPicked);
      if (next) set.add(l.product_id);
      else set.delete(l.product_id);
      setLocalPicked(set);
      try {
        window.localStorage.setItem(forecastKey(data.week.start), JSON.stringify(Array.from(set)));
      } catch {
        /* only a convenience */
      }
      return;
    }
    setBusy(l.product_id);
    setOptimistic((o) => ({ ...o, [l.product_id]: next }));
    try {
      await api("/api/staff/supply/lines", { method: "PATCH", json: { product_id: l.product_id, picked_up: next } });
      onChanged();
    } catch (e) {
      setOptimistic((o) => ({ ...o, [l.product_id]: !next }));
      toast({ title: e instanceof Error ? e.message : T.saveError, variant: "error" });
    } finally {
      setBusy(null);
    }
  }

  const pickedCount = data.lines.filter(isPicked).length;
  const totalUnits = data.lines.reduce((s, l) => s + l.qty, 0);

  return (
    <Card
      title={`${W.pickupList} (${pickedCount}/${data.lines.length})`}
      description={isForecast ? W.forecast : `${totalUnits} יחידות`}
    >
      {data.lines.length === 0 ? (
        <EmptyBlock text={W.noLines} />
      ) : (
        <ul className="space-y-2">
          {data.lines.map((l) => {
            const on = isPicked(l);
            return (
              <li key={l.product_id}>
                <button
                  type="button"
                  onClick={() => void toggle(l)}
                  disabled={busy === l.product_id}
                  aria-pressed={on}
                  className={cn(
                    "flex min-h-[56px] w-full items-center gap-3 rounded-lg border px-3 text-start",
                    on ? "border-primary bg-primary/10" : "bg-background",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded border",
                      on ? "border-primary bg-primary text-primary-foreground" : "border-input",
                    )}
                    aria-hidden="true"
                  >
                    {on && <Check className="h-5 w-5" />}
                  </span>
                  <span className={cn("min-w-0 flex-1 text-base", on && "line-through opacity-70")}>{l.title}</span>
                  <span className="text-xl font-bold tabular-nums">{l.qty}</span>
                  <span className="sr-only">{on ? W.pickedUp : ""}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function Distribution({ data, onSaved }: { data: SupplyData; onSaved: () => void }) {
  const { toast } = useToast();
  const [stallId, setStallId] = useState<string | null>(data.stalls[0]?.id ?? null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!stallId || !data.stalls.some((s) => s.id === stallId)) setStallId(data.stalls[0]?.id ?? null);
  }, [data.stalls, stallId]);

  const productMap = useMemo(
    () => new Map<string, DistributionProduct>(data.products.map((p) => [p.id, { id: p.id, title: p.title, stock: p.stock }])),
    [data.products],
  );
  const titleOf = useMemo(() => new Map(data.products.map((p) => [p.id, p.title])), [data.products]);

  if (data.stalls.length === 0) return <EmptyBlock text={W.noActiveStalls} />;
  const stall = data.stalls.find((s) => s.id === stallId) ?? data.stalls[0];
  const people = data.scheduled[stall.id] ?? [];
  const already = data.distributedToday[stall.id] ?? {};
  const entries = Object.entries(qty).filter(([, n]) => n > 0);

  async function save() {
    const checked = validateDistribution(
      entries.map(([product_id, n]) => ({ product_id, qty: n })),
      productMap,
    );
    if (!checked.ok) {
      toast({ title: checked.error, variant: "error" });
      return;
    }
    const lines = checked.items.map((i) => `${i.title}: ${i.qty}`).join("\n");
    if (!window.confirm(`לשמור חלוקה ל"${stall.name}"?\n${lines}`)) return;
    setSaving(true);
    try {
      await api("/api/staff/supply/distribute", {
        method: "POST",
        json: { stall_id: stall.id, items: checked.items.map((i) => ({ product_id: i.product_id, qty: i.qty })) },
      });
      toast({ title: W.distributeSaved, variant: "success" });
      setQty({});
      onSaved();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : T.saveError, variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card title={W.distribution} description={W.distributionDesc}>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={W.chooseStall}>
          {data.stalls.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={s.id === stall.id}
              onClick={() => {
                setStallId(s.id);
                setQty({});
              }}
              className={cn(
                "min-h-[48px] rounded-lg border px-4 text-base font-medium",
                s.id === stall.id ? "border-primary bg-primary text-primary-foreground" : "bg-background",
              )}
            >
              {s.name}
            </button>
          ))}
        </div>

        <div className="mt-3 rounded-lg bg-muted p-3 text-sm">
          <p className="flex items-center gap-1.5 font-medium">
            <Users className="h-4 w-4" aria-hidden="true" />
            {W.scheduledToday}
          </p>
          {people.length === 0 ? (
            <p className="mt-1 text-muted-foreground">{W.nobodyScheduled}</p>
          ) : (
            <ul className="mt-1 space-y-0.5">
              {people.map((p, i) => (
                <li key={i}>
                  {p.name}{" "}
                  <span className="text-muted-foreground" dir="ltr">
                    {p.start_time}–{p.end_time}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-3 text-sm">
          <p className="font-medium">
            {W.distributedToday} – {stall.name}
          </p>
          {Object.keys(already).length === 0 ? (
            <p className="text-muted-foreground">{W.nothingDistributed}</p>
          ) : (
            <p className="text-muted-foreground">
              {Object.entries(already)
                .map(([pid, n]) => `${titleOf.get(pid) ?? ""} ${n}`)
                .join(" · ")}
            </p>
          )}
        </div>
      </Card>

      <Card title={T.products}>
        {data.products.length === 0 ? (
          <EmptyBlock text="אין זרים פעילים" />
        ) : (
          <ul className="divide-y">
            {data.products.map((p) => {
              const stock = p.stock ?? 0;
              const n = qty[p.id] ?? 0;
              return (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{p.title}</p>
                    <p className={cn("text-xs", stock === 0 ? "text-destructive" : "text-muted-foreground")}>
                      {W.generalStock}: {stock}
                    </p>
                  </div>
                  <QtyStepper
                    value={n}
                    onChange={(v) => setQty((q) => ({ ...q, [p.id]: v }))}
                    min={0}
                    max={stock}
                    label={`${W.qty} – ${p.title}`}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="sticky bottom-4 z-10">
        <Button
          className="h-14 w-full text-base shadow-lg"
          onClick={() => void save()}
          disabled={saving || entries.length === 0}
        >
          <Truck className="h-5 w-5" aria-hidden="true" />
          {saving
            ? "שומר…"
            : entries.length === 0
              ? W.nothingToDistribute
              : `${W.distributeSave} (${entries.reduce((s, [, v]) => s + v, 0)})`}
        </Button>
      </div>
    </div>
  );
}

/** What each stall gets on Friday (split on the stock page). Read-only. */
function DistributionReadOnly({ data }: { data: SupplyData }) {
  const titleOf = useMemo(() => new Map(data.products.map((p) => [p.id, p.title])), [data.products]);
  const stalls = data.stalls.map((s) => {
    const items = Object.entries(data.distributedToday[s.id] ?? {})
      .filter(([, n]) => n > 0)
      .map(([pid, n]) => ({ product_id: pid, title: titleOf.get(pid) ?? "זר", qty: n }))
      .sort((a, b) => a.title.localeCompare(b.title, "he"));
    return { ...s, items, total: items.reduce((t, i) => t + i.qty, 0), people: data.scheduled[s.id] ?? [] };
  });
  const decided = stalls.some((s) => s.total > 0);

  if (data.stalls.length === 0) return <EmptyBlock text={W.noActiveStalls} />;

  return (
    <div className="space-y-4">
      {data.canManage && (
        <a href="/staff/inventory" className="block rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm font-medium text-primary">
          את החלוקה לדוכנים משנים בדף המלאי ←
        </a>
      )}
      {!decided && <NoticeBlock text="עוד לא נקבע כמה זרים יוצאים לכל דוכן בשישי" icon={<Truck className="h-8 w-8 text-muted-foreground" aria-hidden="true" />} />}
      {stalls.map((s) => (
        <Card key={s.id} title={<span className="text-xl">{s.name}</span>}>
          {s.location && (
            <p className="flex items-center gap-1.5 text-base text-muted-foreground">
              <MapPin className="h-5 w-5 shrink-0" aria-hidden="true" />
              {s.location}
            </p>
          )}
          <div className="mt-2 rounded-lg bg-muted p-3 text-base">
            <p className="flex items-center gap-1.5 font-medium">
              <Users className="h-5 w-5" aria-hidden="true" />
              {W.scheduledToday}
            </p>
            {s.people.length === 0 ? (
              <p className="mt-1 text-muted-foreground">{W.nobodyScheduled}</p>
            ) : (
              <ul className="mt-1 space-y-0.5">
                {s.people.map((p, i) => (
                  <li key={i}>
                    {p.name}{" "}
                    <span className="text-muted-foreground" dir="ltr">
                      {p.start_time}–{p.end_time}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {s.items.length === 0 ? (
            <p className="mt-3 text-base text-muted-foreground">עוד לא נקבע לדוכן הזה.</p>
          ) : (
            <ul className="mt-3 divide-y rounded-lg border">
              {s.items.map((i) => (
                <li key={i.product_id} className="flex min-h-[52px] items-center justify-between gap-3 px-3">
                  <span className="min-w-0 flex-1 text-lg">{i.title}</span>
                  <span className="text-2xl font-bold tabular-nums">{i.qty}</span>
                </li>
              ))}
              <li className="flex min-h-[52px] items-center justify-between gap-3 bg-primary/10 px-3 font-bold">
                <span className="text-lg">סה״כ לדוכן</span>
                <span className="text-2xl tabular-nums">{s.total}</span>
              </li>
            </ul>
          )}
        </Card>
      ))}
    </div>
  );
}

export function SupplyView() {
  const { data, error, loading, reload } = useStaffData<SupplyData>("/api/staff/supply");
  const [tab, setTab] = useState<Tab>("pickup");

  if (loading && !data) return <LoadingBlock />;
  if (error && !data) return <ErrorBlock text={error} onRetry={() => void reload()} />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="grid flex-1 grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="tablist">
          {(
            [
              ["pickup", W.pickupList],
              ["distribute", W.distribution],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                "min-h-[44px] rounded-md text-sm font-medium",
                tab === key ? "bg-background shadow-sm" : "text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <RefreshButton onClick={() => void reload()} busy={loading} />
      </div>

      {tab === "pickup" ? (
        <PickupList data={data} onChanged={() => void reload(true)} />
      ) : data.canDistribute ? (
        <Distribution data={data} onSaved={() => void reload(true)} />
      ) : (
        <DistributionReadOnly data={data} />
      )}
    </div>
  );
}
