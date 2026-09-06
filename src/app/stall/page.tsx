"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, ShoppingBag, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatILS } from "@/lib/utils";
import { isLiveStallPhase } from "@/lib/cycleTime";
import type { Product, Inventory } from "@/types";
import PinAuthGate from "@/components/PinAuthGate";

type PaymentMethod = "cash" | "bit";

export default function StallPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saleDialogOpen, setSaleDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [saleQty, setSaleQty] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [productsRes, inventoryRes] = await Promise.all([
          fetch("/api/products"),
          fetch("/api/inventory"),
        ]);
        if (productsRes.ok) {
          const data = await productsRes.json();
          setProducts(data.products ?? []);
        }
        if (inventoryRes.ok) {
          const data = await inventoryRes.json();
          setInventory(data.inventory ?? []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  function getStock(productId: string): number {
    const inv = inventory.find((i) => i.product_id === productId);
    return inv?.live_stock_count ?? 0;
  }

  function getReservedOrders(productId: string): number {
    const inv = inventory.find((i) => i.product_id === productId);
    return inv?.reserved_orders ?? 0;
  }

  async function adjustStock(productId: string, delta: number) {
    // optimistic local update
    setInventory((prev) =>
      prev.map((inv) =>
        inv.product_id === productId
          ? {
              ...inv,
              live_stock_count: Math.max(0, inv.live_stock_count + delta),
            }
          : inv,
      ),
    );
    try {
      const res = await fetch("/api/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: productId, delta }),
      });
      if (!res.ok) {
        // rollback on failure
        setInventory((prev) =>
          prev.map((inv) =>
            inv.product_id === productId
              ? {
                  ...inv,
                  live_stock_count: Math.max(0, inv.live_stock_count - delta),
                }
              : inv,
          ),
        );
        const data = await res.json().catch(() => ({}));
        console.error("Stock adjust failed:", data);
      }
    } catch (e) {
      console.error(e);
    }
  }

  function openSaleDialog(product: Product) {
    if (getStock(product.id) <= 0) return;
    setSelectedProduct(product);
    setSaleQty(1);
    setPaymentMethod("cash");
    setSaleDialogOpen(true);
  }

  async function handleSale() {
    if (!selectedProduct || saleQty <= 0) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/stall/sale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: selectedProduct.id,
          qty: saleQty,
          payment_method: paymentMethod,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "שגיאה בביצוע המכירה");
      }
      adjustStock(selectedProduct.id, -saleQty);
      setSaleDialogOpen(false);
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "שגיאה בביצוע המכירה");
    } finally {
      setSubmitting(false);
    }
  }

  function handleLogout() {
    document.cookie =
      "flowers_stall_auth=; Path=/; Max-Age=0; SameSite=Lax";
    router.replace("/stall");
  }

  return (
    <PinAuthGate pinRole="STALL">
      <main className="min-h-screen bg-muted/30 p-4" dir="rtl">
        <div className="mx-auto max-w-2xl space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">ניהול דוכן</h1>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="gap-2"
            >
              <LogOut className="h-4 w-4" />
              יציאה
            </Button>
          </div>

          {loading ? (
            <p className="text-center text-muted-foreground">טוען...</p>
          ) : products.length === 0 ? (
            <p className="text-center text-muted-foreground">אין מוצרים פעילים</p>
          ) : (
            <div className="grid gap-4">
              {products.map((product) => {
                const stock = getStock(product.id);
                const reservedOrders = getReservedOrders(product.id);
                return (
                  <div
                    key={product.id}
                    className="rounded-lg border bg-card p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <h2 className="text-lg font-semibold">{product.title}</h2>
                        <p className="text-xl font-bold text-primary">
                          {formatILS(product.price_standard)}
                        </p>
                        <p className="text-sm font-medium text-primary">
                          זמין למכירה: {stock}
                        </p>
                        {reservedOrders > 0 && (
                          <p className="text-sm text-orange-600">
                            תפוס בהזמנות עדיין: {reservedOrders}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => adjustStock(product.id, -1)}
                          disabled={stock <= 0}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => adjustStock(product.id, 1)}
                          disabled={isLiveStallPhase()}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          onClick={() => openSaleDialog(product)}
                          disabled={stock <= 0}
                        >
                          <ShoppingBag className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <Dialog open={saleDialogOpen} onOpenChange={setSaleDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>מכירה מהירה</DialogTitle>
            </DialogHeader>
            {selectedProduct && (
              <div className="space-y-4">
                <div>
                  <p className="font-medium">{selectedProduct.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatILS(selectedProduct.price_standard)}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="qty">כמות</Label>
                  <Input
                    id="qty"
                    type="number"
                    min={1}
                    max={getStock(selectedProduct.id)}
                    value={saleQty}
                    onChange={(e) =>
                      setSaleQty(Math.max(1, parseInt(e.target.value) || 1))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>אמצעי תשלום</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={paymentMethod === "cash" ? "default" : "outline"}
                      onClick={() => setPaymentMethod("cash")}
                      className="flex-1"
                    >
                      מזומן
                    </Button>
                    <Button
                      type="button"
                      variant={paymentMethod === "bit" ? "default" : "outline"}
                      onClick={() => setPaymentMethod("bit")}
                      className="flex-1"
                    >
                      ביט
                    </Button>
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={handleSale}
                  disabled={submitting}
                >
                  {submitting ? "מעבד..." : "אשר מכירה"}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </PinAuthGate>
  );
}
