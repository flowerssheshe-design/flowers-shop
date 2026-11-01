"use client";

import * as React from "react";
import { Check, Eye, Minus, Pencil, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toaster";
import { StaffPageHeader, type ShellEmployee } from "@/components/staff/StaffShell";
import { canManageTeam, hasRole } from "@/lib/staff/access";
import { T } from "@/lib/staff/labels";
import { cn } from "@/lib/utils";
import { OPS } from "@/lib/staff/ops/labels";
import { formatDate, opsFetch } from "@/lib/staff/ops/client";
import type { InventoryRow } from "@/lib/staff/ops/types";
import { EmptyBlock, ErrorBlock, LoadingBlock, useOpsData } from "./common";

type InventoryResponse = {
  rows: InventoryRow[];
  stalls: { id: string; name: string }[];
  canEdit: boolean;
  friday?: string;
};

/**
 * Stock: what the website can still sell, and how many of each bouquet go to
 * each stall on Friday. The shift manager splits the stock between the stalls
 * any day of the week; the difference moves to/from the website stock.
 */
export function InventoryView({ me }: { me: ShellEmployee }) {
  const { data, error, loading, reload, setData } = useOpsData<InventoryResponse>("/api/staff/inventory", (u) => opsFetch(u));
  const [editId, setEditId] = React.useState<string | null>(null);
  const canEditLive = canManageTeam(me) && (data?.canEdit ?? false);
  const canDistribute = hasRole(me, "owner") || hasRole(me, "ops_manager");

  function patchRow(productId: string, patch: Partial<InventoryRow>) {
    setData((d) => (d ? { ...d, rows: d.rows.map((r) => (r.product_id === productId ? { ...r, ...patch } : r)) } : d));
  }

  const stalls = data?.stalls ?? [];
  const rows = data?.rows ?? [];
  const fridayLabel = data?.friday ? `יום שישי ${formatDate(data.friday)}` : "יום שישי";

  return (
    <div>
      <StaffPageHeader
        title={T.stock}
        description={`כמה נשאר לאתר, וכמה מכל זר יוצא לכל דוכן ב${fridayLabel}.`}
        actions={
          !canDistribute && (
            <Badge variant="outline" className="gap-1">
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              {OPS.readOnly}
            </Badge>
          )
        }
      />

      {loading && !data ? (
        <LoadingBlock />
      ) : error && !data ? (
        <ErrorBlock message={error} onRetry={reload} />
      ) : rows.length === 0 ? (
        <EmptyBlock message={OPS.noProducts} />
      ) : (
        <>
          <p className="mb-3 text-sm text-muted-foreground">
            <b>נשאר לאתר</b> = מה שעוד אפשר להזמין באתר.{" "}
            {stalls.length > 0 && <>בעמודות הדוכנים: כמה מכל זר יוצא לכל דוכן ב{fridayLabel}. </>}
            {canDistribute && stalls.length > 0 && (
              <a href="/staff/stalls" className="font-medium text-primary underline">
                משנים את החלוקה בניהול דוכנים ← חלוקת זרים
              </a>
            )}
          </p>

          {/* Mobile cards */}
          <ul className="space-y-3 md:hidden">
            {rows.map((r) => (
              <li key={r.product_id} className="rounded-lg border bg-background p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">
                    {r.title}
                    {!r.is_active && <span className="ms-1 text-xs text-muted-foreground">(לא פעיל)</span>}
                  </p>
                  {canEditLive && editId !== r.product_id && (
                    <Button variant="ghost" size="icon" onClick={() => setEditId(r.product_id)} aria-label={`${T.edit} ${r.title}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                {editId === r.product_id ? (
                  <LiveEditor
                    row={r}
                    onCancel={() => setEditId(null)}
                    onSaved={(live) => {
                      patchRow(r.product_id, { live_stock_count: live });
                      setEditId(null);
                    }}
                  />
                ) : (
                  <dl className="mt-2 grid grid-cols-2 gap-2 text-center">
                    <Stat label="נשאר לאתר" value={r.live_stock_count} strong warn={r.live_stock_count === 0} />
                    <Stat label={OPS.reserved} value={r.reserved} />
                  </dl>
                )}
                {stalls.length > 0 && (
                  <div className="mt-3 space-y-2 border-t pt-3">
                    <p className="text-xs text-muted-foreground">לדוכנים ב{fridayLabel}</p>
                    {stalls.map((s) => (
                      <div key={s.id} className="flex items-center justify-between gap-2">
                        <span className="text-sm">{s.name}</span>
                        <StallQty
                          row={r}
                          stallId={s.id}
                          stallName={s.name}
                          editable={false}
                          onSaved={(stock, live) => patchRow(r.product_id, { live_stock_count: live, stalls: { ...r.stalls, [s.id]: stock } })}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-lg border bg-background md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-right text-xs text-muted-foreground">
                <tr>
                  <th className="p-3 font-medium">{T.product}</th>
                  <th className="p-3 font-medium">נשאר לאתר</th>
                  <th className="p-3 font-medium">{OPS.reserved}</th>
                  {stalls.map((s) => (
                    <th key={s.id} className="p-3 font-medium">
                      {s.name}
                      <span className="block font-normal">ב{fridayLabel}</span>
                    </th>
                  ))}
                  {canEditLive && <th className="p-3" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.product_id} className="border-t">
                    <td className="p-3 font-medium">
                      {r.title}
                      {!r.is_active && <span className="ms-1 text-xs text-muted-foreground">(לא פעיל)</span>}
                    </td>
                    <td className={cn("p-3 font-semibold tabular-nums", r.live_stock_count === 0 && "text-destructive")}>
                      {editId === r.product_id ? (
                        <LiveEditor
                          row={r}
                          onCancel={() => setEditId(null)}
                          onSaved={(live) => {
                            patchRow(r.product_id, { live_stock_count: live });
                            setEditId(null);
                          }}
                        />
                      ) : (
                        r.live_stock_count
                      )}
                    </td>
                    <td className="p-3 tabular-nums">{r.reserved}</td>
                    {stalls.map((s) => (
                      <td key={s.id} className="p-3">
                        <StallQty
                          row={r}
                          stallId={s.id}
                          stallName={s.name}
                          editable={false}
                          onSaved={(stock, live) => patchRow(r.product_id, { live_stock_count: live, stalls: { ...r.stalls, [s.id]: stock } })}
                        />
                      </td>
                    ))}
                    {canEditLive && (
                      <td className="p-3 text-left">
                        {editId !== r.product_id && (
                          <Button variant="ghost" size="sm" onClick={() => setEditId(r.product_id)}>
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                            {T.edit}
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, strong, warn }: { label: string; value: number; strong?: boolean; warn?: boolean }) {
  return (
    <div className="flex flex-col-reverse rounded-md bg-muted/40 px-1 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("tabular-nums", strong ? "text-xl font-bold" : "text-lg", warn && "text-destructive")}>{value}</dd>
    </div>
  );
}

/** How many of a bouquet a stall gets on Friday: − / number / + and save. */
function StallQty({
  row,
  stallId,
  stallName,
  editable,
  onSaved,
}: {
  row: InventoryRow;
  stallId: string;
  stallName: string;
  editable: boolean;
  onSaved: (stock: number, live: number) => void;
}) {
  const saved = row.stalls[stallId] ?? 0;
  const [value, setValue] = React.useState(String(saved));
  const [busy, setBusy] = React.useState(false);
  const { toast } = useToast();
  React.useEffect(() => setValue(String(saved)), [saved]);

  if (!editable) return <span className="tabular-nums">{saved}</span>;

  const n = Number(value);
  const valid = value.trim() !== "" && Number.isInteger(n) && n >= 0;
  const dirty = valid && n !== saved;
  const max = saved + row.live_stock_count;

  async function save(target = n) {
    if (!Number.isInteger(target) || target < 0 || target === saved) return;
    setBusy(true);
    try {
      const res = await opsFetch<{ stock: number; live: number }>("/api/staff/inventory/stalls", {
        method: "PUT",
        body: { product_id: row.product_id, stall_id: stallId, qty: target },
      });
      onSaved(res.stock, res.live);
      toast({ title: `${stallName}: ${res.stock} ${row.title}`, variant: "success" });
    } catch (e) {
      setValue(String(saved));
      toast({ title: e instanceof Error ? e.message : T.saveError, variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-10 w-10 shrink-0"
        aria-label={`פחות ל${stallName}`}
        disabled={busy || saved === 0}
        onClick={() => void save(saved - 1)}
      >
        <Minus className="h-4 w-4" />
      </Button>
      <Input
        type="number"
        inputMode="numeric"
        min={0}
        max={max}
        dir="ltr"
        value={value}
        disabled={busy}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => dirty && void save()}
        onKeyDown={(e) => e.key === "Enter" && dirty && void save()}
        className={cn("h-10 w-16 text-center tabular-nums", dirty && "border-primary")}
        aria-label={`כמה ${row.title} ל${stallName}`}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-10 w-10 shrink-0"
        aria-label={`עוד ל${stallName}`}
        disabled={busy || row.live_stock_count === 0}
        onClick={() => void save(saved + 1)}
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}

/** Owners: set what the website can still sell. */
function LiveEditor({ row, onCancel, onSaved }: { row: InventoryRow; onCancel: () => void; onSaved: (live: number) => void }) {
  const [live, setLive] = React.useState(String(row.live_stock_count));
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const { toast } = useToast();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const l = Number(live);
    if (!Number.isInteger(l) || l < 0) return setErr("כתבו מספר שלם, 0 ומעלה.");
    setBusy(true);
    setErr(null);
    try {
      const res = await opsFetch<{ live_stock_count: number }>("/api/staff/inventory", {
        method: "PATCH",
        body: { product_id: row.product_id, live_stock_count: l },
      });
      onSaved(res.live_stock_count);
      toast({ title: T.saved, variant: "success" });
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : T.saveError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="mt-2 space-y-1 md:mt-0">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="h-10 w-20"
          type="number"
          inputMode="numeric"
          min={0}
          dir="ltr"
          value={live}
          onChange={(e) => setLive(e.target.value)}
          autoFocus
          aria-label="נשאר לאתר"
        />
        <Button type="submit" size="sm" className="h-10" disabled={busy}>
          <Check className="h-4 w-4" aria-hidden="true" />
          {busy ? T.saving : T.save}
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-10" onClick={onCancel} disabled={busy}>
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      {err && <p className="text-xs font-normal text-destructive">{err}</p>}
    </form>
  );
}
