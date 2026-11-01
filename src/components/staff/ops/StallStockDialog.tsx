"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toaster";
import { T } from "@/lib/staff/labels";
import { cn } from "@/lib/utils";
import { formatDate, opsFetch } from "@/lib/staff/ops/client";
import type { InventoryRow } from "@/lib/staff/ops/types";
import { ErrorBlock, FormSheet, LoadingBlock, useOpsData } from "./common";

type InventoryResponse = { rows: InventoryRow[]; friday?: string };

/**
 * "חלוקת זרים" for one stall: how many of each bouquet go to it on Friday.
 * Adding takes from what the website can still sell; lowering gives it back.
 */
export function StallStockDialog({
  stallId,
  stallName,
  onClose,
  onSaved,
}: {
  stallId: string;
  stallName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data, error, loading, reload } = useOpsData<InventoryResponse>("/api/staff/inventory", (u) => opsFetch(u));
  const [target, setTarget] = React.useState<Record<string, number>>({});
  const [saving, setSaving] = React.useState(false);
  const { toast } = useToast();

  const rows = (data?.rows ?? []).filter((r) => r.is_active || (r.stalls[stallId] ?? 0) > 0);
  const current = (r: InventoryRow) => r.stalls[stallId] ?? 0;
  const want = (r: InventoryRow) => target[r.product_id] ?? current(r);
  /** The most this stall can get: what it has + what the website still has. */
  const max = (r: InventoryRow) => current(r) + r.live_stock_count;
  const changed = rows.filter((r) => want(r) !== current(r));
  const total = rows.reduce((t, r) => t + want(r), 0);

  function set(r: InventoryRow, n: number) {
    const v = Math.max(0, Math.min(max(r), Math.floor(Number.isFinite(n) ? n : 0)));
    setTarget((t) => ({ ...t, [r.product_id]: v }));
  }

  async function save() {
    setSaving(true);
    let failed = 0;
    for (const r of changed) {
      try {
        await opsFetch("/api/staff/inventory/stalls", {
          method: "PUT",
          body: { product_id: r.product_id, stall_id: stallId, qty: want(r) },
        });
      } catch (e) {
        failed++;
        toast({ title: `${r.title}: ${e instanceof Error ? e.message : T.saveError}`, variant: "error" });
      }
    }
    setSaving(false);
    onSaved();
    if (failed === 0) {
      toast({ title: `החלוקה ל${stallName} נשמרה`, variant: "success" });
      onClose();
    } else {
      setTarget({});
      reload();
    }
  }

  return (
    <FormSheet
      open
      onOpenChange={(o) => !o && !saving && onClose()}
      title={`חלוקת זרים ל${stallName}`}
      footer={
        <>
          <Button variant="outline" className="h-11 sm:h-10" onClick={onClose} disabled={saving}>
            {T.cancel}
          </Button>
          <Button className="h-11 sm:h-10" onClick={save} disabled={saving || changed.length === 0}>
            {saving ? T.saving : `${T.save}${changed.length ? ` (${changed.length})` : ""}`}
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted-foreground">
        כמה מכל זר יוצא ל{stallName} {data?.friday ? `ביום שישי ${formatDate(data.friday)}` : "ביום שישי"}. מה שמוסיפים יורד
        מהמלאי של האתר, ומה שמורידים חוזר אליו.
      </p>

      {loading && !data ? (
        <LoadingBlock />
      ) : error && !data ? (
        <ErrorBlock message={error} onRetry={reload} />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">אין זרים במלאי.</p>
      ) : (
        <>
          <ul className="divide-y rounded-md border">
            {rows.map((r) => {
              const w = want(r);
              const diff = w - current(r);
              return (
                <li key={r.product_id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{r.title}</p>
                    <p className="text-xs text-muted-foreground">
                      נשאר לאתר: {r.live_stock_count - Math.max(0, diff) + Math.max(0, -diff)}
                      {diff !== 0 && (
                        <span className={cn("ms-1 font-medium", diff > 0 ? "text-primary" : "text-amber-700")}>
                          ({diff > 0 ? `+${diff}` : diff} לדוכן)
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-11 w-11"
                      aria-label={`פחות ${r.title}`}
                      disabled={saving || w === 0}
                      onClick={() => set(r, w - 1)}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={max(r)}
                      dir="ltr"
                      value={w}
                      disabled={saving}
                      onChange={(e) => set(r, Number(e.target.value))}
                      className={cn("h-11 w-16 text-center tabular-nums", diff !== 0 && "border-primary")}
                      aria-label={`כמה ${r.title} ל${stallName}`}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-11 w-11"
                      aria-label={`עוד ${r.title}`}
                      disabled={saving || w >= max(r)}
                      onClick={() => set(r, w + 1)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="text-sm font-medium">סה״כ ל{stallName}: {total} זרים</p>
        </>
      )}
    </FormSheet>
  );
}
