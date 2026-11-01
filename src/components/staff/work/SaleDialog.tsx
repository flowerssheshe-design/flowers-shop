"use client";

import { useEffect, useState } from "react";
import { Banknote, Smartphone, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toaster";
import { formatILS } from "@/lib/utils";
import { api } from "@/lib/staff/work/client";
import { computeSaleTotal } from "@/lib/staff/work/sales";
import { W } from "@/lib/staff/work/labels";
import { BitPayModal } from "./BitPayModal";
import { QtyStepper } from "./QtyStepper";
import type { StallProduct } from "./stall-types";

/** Sell one product: quantity, price (defaults to the regular price), then cash or Bit. */
export function SaleDialog({
  product,
  stallId,
  onClose,
  onSold,
  bit,
  stallName,
}: {
  product: StallProduct | null;
  stallId: string;
  onClose: () => void;
  onSold: () => void;
  bit: { number: string; qr_url: string };
  stallName: string;
}) {
  const { toast } = useToast();
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState<"cash" | "bit" | null>(null);
  const [showBit, setShowBit] = useState(false);

  useEffect(() => {
    if (product) {
      setQty(1);
      setPrice(String(product.price_standard));
      setSaving(null);
      setShowBit(false);
    }
  }, [product]);

  if (!product) return null;

  const unitPrice = Number(price);
  const priceValid = price.trim() !== "" && Number.isFinite(unitPrice) && unitPrice >= 0 && unitPrice <= 10000;
  const total = priceValid ? computeSaleTotal([{ qty, unit_price: unitPrice }]) : 0;
  const canSell = priceValid && qty >= 1 && qty <= product.stock && !saving;

  async function sell(method: "cash" | "bit") {
    if (!product || !canSell) return;
    setSaving(method);
    try {
      await api("/api/staff/stall/sale", {
        method: "POST",
        json: {
          stall_id: stallId,
          payment_method: method,
          items: [{ product_id: product.id, qty, unit_price: unitPrice }],
        },
      });
      toast({ title: W.saleSaved, description: `${product.title} × ${qty} · ${formatILS(total)}`, variant: "success" });
      onSold();
      onClose();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : W.saleSaved, variant: "error" });
      setSaving(null);
    }
  }

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="flex flex-col overflow-y-auto"
        dir="rtl"
        onEscapeKeyDown={(e) => showBit && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {W.sell}: {product.title}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {W.stockLive}: {product.stock}
          </p>
        </DialogHeader>

        <div className="space-y-5 p-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">{W.qty}</p>
            <QtyStepper value={qty} onChange={setQty} min={1} max={Math.max(1, product.stock)} label={W.qty} />
          </div>

          <div className="space-y-2">
            <label htmlFor="sale-price" className="text-sm font-medium">
              {W.unitPrice} (₪)
            </label>
            <input
              id="sale-price"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.5"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              onFocus={(e) => e.target.select()}
              className="h-12 w-full rounded-md border border-input bg-background px-3 text-lg tabular-nums"
            />
            {priceValid && unitPrice !== product.price_standard && (
              <p className="text-xs text-amber-700">
                {W.priceChanged} ({formatILS(product.price_standard)})
              </p>
            )}
            {!priceValid && <p className="text-xs text-destructive">רשמו מחיר תקין</p>}
          </div>

          <div className="rounded-lg bg-muted p-4 text-center">
            <p className="text-sm text-muted-foreground">סה״כ לתשלום</p>
            <p className="text-3xl font-bold tabular-nums">{formatILS(total)}</p>
          </div>

          <Button
            type="button"
            variant="outline"
            className="h-12 w-full text-base"
            onClick={() => setShowBit(true)}
            disabled={!priceValid}
          >
            <QrCode className="h-5 w-5" aria-hidden="true" />
            {W.showBit}
          </Button>

          <div className="grid grid-cols-2 gap-3">
            <Button className="h-16 text-base" onClick={() => void sell("cash")} disabled={!canSell}>
              <Banknote className="h-5 w-5" aria-hidden="true" />
              {saving === "cash" ? "שומר…" : W.payCash}
            </Button>
            <Button
              className="h-16 bg-[#00a3a9] text-base text-white hover:bg-[#00a3a9]/90"
              onClick={() => void sell("bit")}
              disabled={!canSell}
            >
              <Smartphone className="h-5 w-5" aria-hidden="true" />
              {saving === "bit" ? "שומר…" : W.payBit}
            </Button>
          </div>
        </div>
        {/* Inside the dialog so the modal dialog's focus trap does not block it. */}
        <BitPayModal
          open={showBit}
          onClose={() => setShowBit(false)}
          amount={total}
          bitNumber={bit.number}
          qrUrl={bit.qr_url}
          stallName={stallName}
        />
      </DialogContent>
    </Dialog>
  );
}
