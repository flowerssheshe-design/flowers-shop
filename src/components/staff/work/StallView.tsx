"use client";

import { useEffect, useMemo, useState } from "react";
import { QrCode, Store, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toaster";
import { cn, formatILS } from "@/lib/utils";
import { T } from "@/lib/staff/labels";
import { W } from "@/lib/staff/work/labels";
import { api, formatTime, useStaffData } from "@/lib/staff/work/client";
import { BitPayModal } from "./BitPayModal";
import { ChecklistCard } from "./ChecklistCard";
import { PickupOrders } from "./PickupOrders";
import { SaleDialog } from "./SaleDialog";
import { WriteOffDialog } from "./WriteOffDialog";
import { Card, EmptyBlock, ErrorBlock, LoadingBlock, NoticeBlock, RefreshButton, Stat } from "./common";
import type { StallData, StallProduct, StallSale } from "./stall-types";

const POLL_MS = 20_000;
const STALL_KEY = "staff.stall.selected";
type Tab = "sell" | "pickup" | "equipment";

function readStoredStall(): string | null {
  try {
    return window.localStorage.getItem(STALL_KEY);
  } catch {
    return null;
  }
}

export function StallView({ meId }: { meId: string }) {
  const { toast } = useToast();
  const [stallId, setStallId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("sell");
  const [selling, setSelling] = useState<StallProduct | null>(null);
  const [writeOffOpen, setWriteOffOpen] = useState(false);
  const [bitOpen, setBitOpen] = useState(false);
  const [undoing, setUndoing] = useState<string | null>(null);
  const [togglingOpen, setTogglingOpen] = useState(false);

  useEffect(() => {
    setStallId(readStoredStall());
    setReady(true);
  }, []);

  const url = ready ? `/api/staff/stall${stallId ? `?stall_id=${encodeURIComponent(stallId)}` : ""}` : null;
  const { data, error, loading, reload } = useStaffData<StallData>(url, POLL_MS);

  // The server falls back to the default stall when the stored one is not allowed.
  useEffect(() => {
    if (!data?.stall) return;
    if (!stallId || !data.stalls.some((s) => s.id === stallId)) setStallId(data.stall.id);
  }, [data, stallId]);

  function chooseStall(id: string) {
    setStallId(id);
    try {
      window.localStorage.setItem(STALL_KEY, id);
    } catch {
      /* ignore */
    }
  }

  const products = useMemo(
    () => [...(data?.products ?? [])].sort((a, b) => Number(b.stock > 0) - Number(a.stock > 0)),
    [data?.products],
  );

  async function undoSale(sale: StallSale) {
    if (!window.confirm(`${W.undoConfirm}\n${formatILS(sale.total_amount)}`)) return;
    setUndoing(sale.id);
    try {
      await api(`/api/staff/stall/sales/${sale.id}/cancel`, { method: "POST" });
      toast({ title: W.saleUndone, variant: "success" });
      void reload(true);
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : T.saveError, variant: "error" });
    } finally {
      setUndoing(null);
    }
  }

  async function setOpen(open: boolean) {
    if (!data?.stall) return;
    setTogglingOpen(true);
    try {
      await api("/api/staff/stall/open", { method: "POST", json: { stall_id: data.stall.id, is_open: open } });
      toast({ title: open ? "הדוכן פתוח" : "הדוכן נסגר", variant: "success" });
      void reload(true);
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : T.saveError, variant: "error" });
    } finally {
      setTogglingOpen(false);
    }
  }

  if (!ready || (loading && !data)) return <LoadingBlock />;
  if (error && !data) return <ErrorBlock text={error} onRetry={() => void reload()} />;
  if (!data) return null;

  if (!data.stall) {
    return (
      <NoticeBlock
        icon={<Store className="h-10 w-10 text-muted-foreground" aria-hidden="true" />}
        text={data.canChooseStall ? W.noActiveStalls : W.noStallToday}
      />
    );
  }

  const stall = data.stall;
  const summary = data.summary ?? { count: 0, total: 0, bit: 0, cash: 0, other: 0, units: 0 };
  const sales = data.sales ?? [];
  const pickups = data.pickupOrders ?? [];

  return (
    <div className="space-y-4">
      {/* Stall picker + Bit */}
      <div className="flex flex-wrap items-center gap-2">
        {data.stalls.length > 1 ? (
          <select
            value={stall.id}
            onChange={(e) => chooseStall(e.target.value)}
            className="h-12 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-base font-semibold"
            aria-label={W.chooseStall}
          >
            {data.stalls.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.location ? ` – ${s.location}` : ""}
              </option>
            ))}
          </select>
        ) : (
          <p className="min-w-0 flex-1 text-lg font-semibold">
            {stall.name}
            {stall.location && <span className="text-sm font-normal text-muted-foreground"> – {stall.location}</span>}
          </p>
        )}
        <Button className="h-12 bg-[#00a3a9] text-base text-white hover:bg-[#00a3a9]/90" onClick={() => setBitOpen(true)}>
          <QrCode className="h-5 w-5" aria-hidden="true" />
          {W.showBit}
        </Button>
      </div>

      {/* Open / closed: shown to customers on the website */}
      <label
        className={cn(
          "flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-lg border-2 px-4 py-3",
          stall.is_open ? "border-emerald-600 bg-emerald-50" : "border-muted bg-muted/40",
        )}
      >
        <span>
          <span className={cn("block text-lg font-bold", stall.is_open ? "text-emerald-800" : "text-foreground")}>
            {stall.is_open ? "הדוכן פתוח" : "הדוכן סגור"}
          </span>
          <span className="block text-xs text-muted-foreground">
            {stall.is_open ? "הלקוחות רואים באתר שהדוכן פתוח" : "פותחים כשמגיעים לדוכן, סוגרים בסוף היום"}
          </span>
        </span>
        <Switch
          checked={stall.is_open}
          disabled={togglingOpen}
          onCheckedChange={(v) => void setOpen(v)}
          aria-label={stall.is_open ? "סגירת הדוכן" : "פתיחת הדוכן"}
          className="scale-125"
        />
      </label>

      {/* Tabs */}
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1" role="tablist">
        {(
          [
            ["sell", W.sell],
            ["pickup", `${W.pickupOrders}${pickups.length ? ` (${pickups.length})` : ""}`],
            ["equipment", "ציוד ופחת"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "min-h-[44px] rounded-md px-2 text-sm font-medium",
              tab === key ? "bg-background shadow-sm" : "text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "sell" && (
        <>
          <Card title={W.summaryToday} actions={<RefreshButton onClick={() => void reload()} busy={loading} />}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label={W.salesCount} value={summary.count} hint={`${summary.units} ${T.products}`} />
              <Stat label={T.total} value={formatILS(summary.total)} />
              <Stat label={T.bit} value={formatILS(summary.bit)} />
              <Stat label={T.cash} value={formatILS(summary.cash)} />
            </div>
          </Card>

          <Card
            title={W.stockLive}
            description={W.autoRefresh}
            actions={
              <Button variant="outline" className="h-11" onClick={() => setWriteOffOpen(true)}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                {W.writeOff}
              </Button>
            }
          >
            {products.length === 0 ? (
              <EmptyBlock text="אין זרים פעילים" />
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {products.map((p) => {
                  const out = p.stock <= 0;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelling(p)}
                      disabled={out}
                      className={cn(
                        "flex min-h-[96px] flex-col justify-between rounded-lg border p-3 text-start transition",
                        out ? "cursor-not-allowed bg-muted/50 opacity-60" : "bg-background hover:border-primary active:bg-primary/5",
                      )}
                    >
                      <span className="line-clamp-2 text-sm font-semibold">{p.title}</span>
                      <span className="mt-2 flex items-end justify-between gap-1">
                        <span className={cn("text-2xl font-bold tabular-nums", out && "text-destructive")}>
                          {out ? W.outOfStock : p.stock}
                        </span>
                        <span className="text-xs text-muted-foreground">{formatILS(p.price_standard)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>

          <Card title={W.todaySales}>
            {sales.length === 0 ? (
              <EmptyBlock text={W.noSalesToday} />
            ) : (
              <ul className="divide-y">
                {sales.map((s) => {
                  const cancelled = s.status !== "completed";
                  return (
                    <li key={s.id} className={cn("flex items-center gap-3 py-2.5", cancelled && "opacity-50")}>
                      <div className="min-w-0 flex-1">
                        <p className={cn("truncate text-sm font-medium", cancelled && "line-through")}>
                          {(s.items ?? []).map((it) => `${it.title} × ${it.qty}`).join(", ")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatTime(s.created_at)} · {s.payment_method === "bit" ? T.bit : T.cash}
                          {s.sold_by === meId ? " · אני" : ""}
                          {cancelled ? ` · ${T.status.cancelled}` : ""}
                        </p>
                      </div>
                      <span className="text-sm font-semibold tabular-nums">{formatILS(s.total_amount)}</span>
                      {!cancelled && (
                        <Button
                          variant="ghost"
                          className="h-11 w-11 shrink-0 p-0"
                          onClick={() => void undoSale(s)}
                          disabled={undoing === s.id}
                          aria-label={W.undoSale}
                          title={W.undoSale}
                        >
                          <Undo2 className="h-5 w-5" />
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </>
      )}

      {tab === "pickup" && <PickupOrders orders={pickups} onChanged={() => void reload(true)} />}

      {tab === "equipment" && (
        <>
          <ChecklistCard
            key={`open-${stall.id}`}
            kind="open"
            stallId={stall.id}
            items={data.equipment ?? []}
            saved={data.checklists?.open ?? null}
            onSaved={() => void reload(true)}
          />
          <ChecklistCard
            key={`close-${stall.id}`}
            kind="close"
            stallId={stall.id}
            items={data.equipment ?? []}
            saved={data.checklists?.close ?? null}
            onSaved={() => void reload(true)}
          />
          <Card
            title={W.writeOffsToday}
            actions={
              <Button variant="outline" className="h-11" onClick={() => setWriteOffOpen(true)}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                {W.writeOff}
              </Button>
            }
          >
            {(data.writeoffs ?? []).length === 0 ? (
              <EmptyBlock text="לא נרשם פחת היום" />
            ) : (
              <ul className="divide-y text-sm">
                {(data.writeoffs ?? []).map((w) => (
                  <li key={w.id} className="flex justify-between gap-2 py-2">
                    <span>
                      {w.title} × {w.qty}
                      {w.reason && <span className="text-muted-foreground"> · {w.reason}</span>}
                    </span>
                    <span className="text-muted-foreground">{formatTime(w.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      <SaleDialog
        product={selling}
        stallId={stall.id}
        stallName={stall.name}
        bit={data.bit}
        onClose={() => setSelling(null)}
        onSold={() => void reload(true)}
      />
      <WriteOffDialog
        open={writeOffOpen}
        products={products}
        stallId={stall.id}
        onClose={() => setWriteOffOpen(false)}
        onDone={() => void reload(true)}
      />
      <BitPayModal
        open={bitOpen}
        onClose={() => setBitOpen(false)}
        amount={0}
        bitNumber={data.bit.number}
        qrUrl={data.bit.qr_url}
        stallName={stall.name}
      />
    </div>
  );
}
