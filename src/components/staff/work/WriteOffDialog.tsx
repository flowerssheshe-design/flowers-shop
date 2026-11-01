"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { api } from "@/lib/staff/work/client";
import { W } from "@/lib/staff/work/labels";
import { QtyStepper } from "./QtyStepper";
import type { StallProduct } from "./stall-types";

/** "פרח נפגע / נזרק": choose the bouquet, how many and why. */
export function WriteOffDialog({
  open,
  products,
  stallId,
  onClose,
  onDone,
}: {
  open: boolean;
  products: StallProduct[];
  stallId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [productId, setProductId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState<string>(W.writeOffReasons[0]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setProductId(null);
      setQty(1);
      setReason(W.writeOffReasons[0]);
      setSaving(false);
    }
  }, [open]);

  const inStock = products.filter((p) => p.stock > 0);
  const selected = inStock.find((p) => p.id === productId) ?? null;

  async function save() {
    if (!selected) return;
    if (!window.confirm(`להוריד ${qty} × "${selected.title}" מהמלאי (${reason})?`)) return;
    setSaving(true);
    try {
      await api("/api/staff/stall/writeoff", {
        method: "POST",
        json: { stall_id: stallId, product_id: selected.id, qty, reason },
      });
      toast({ title: W.writeOffSaved, variant: "success" });
      onDone();
      onClose();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : W.writeOff, variant: "error" });
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex flex-col overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>{W.writeOff}</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 p-4">
          {inStock.length === 0 ? (
            <p className="text-sm text-muted-foreground">אין זרים במלאי הדוכן</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {inStock.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setProductId(p.id);
                    setQty(1);
                  }}
                  className={cn(
                    "min-h-[56px] rounded-lg border p-2 text-start text-sm font-medium",
                    productId === p.id ? "border-primary bg-primary/10" : "bg-background",
                  )}
                >
                  {p.title}
                  <span className="block text-xs text-muted-foreground">
                    {W.stockLive}: {p.stock}
                  </span>
                </button>
              ))}
            </div>
          )}

          {selected && (
            <>
              <div className="space-y-2">
                <p className="text-sm font-medium">{W.qty}</p>
                <QtyStepper value={qty} onChange={setQty} min={1} max={selected.stock} label={W.qty} />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">{W.writeOffReason}</p>
                <div className="flex flex-wrap gap-2">
                  {W.writeOffReasons.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setReason(r)}
                      className={cn(
                        "h-11 rounded-full border px-4 text-sm",
                        reason === r ? "border-primary bg-primary text-primary-foreground" : "bg-background",
                      )}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <Button variant="destructive" className="h-14 w-full text-base" onClick={() => void save()} disabled={saving}>
                {saving ? "שומר…" : `הורדה מהמלאי (${qty})`}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
