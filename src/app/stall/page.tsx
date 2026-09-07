"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Search, CheckCircle2, Tag, ArrowDownToLine, RefreshCw } from "lucide-react";
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
import { useToast } from "@/components/ui/toaster";
import type { Product, Inventory, Order } from "@/types";
import PinAuthGate from "@/components/PinAuthGate";

type DeductReason = "sale" | "ruined" | "waste";

const REASON_LABELS: Record<DeductReason, string> = {
  sale: "מכירה בדוכן",
  ruined: "פרוע/נזרק",
  waste: "אבדה",
};

export default function StallPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'selfPickup' | 'liveSales'>('liveSales');
  const [selfOrders, setSelfOrders] = useState<Order[]>([]);
  const [searchName, setSearchName] = useState('');
  const [searchPhone, setSearchPhone] = useState('');

  const [deductDialogOpen, setDeductDialogOpen] = useState(false);
  const [deductProduct, setDeductProduct] = useState<Product | null>(null);
  const [deductQty, setDeductQty] = useState(1);
  const [deductReason, setDeductReason] = useState<DeductReason>("sale");
  const [deducting, setDeducting] = useState(false);
  const { toast } = useToast();

  async function load() {
    setLoading(true);
    try {
      const [productsRes, inventoryRes, ordersRes] = await Promise.all([
        fetch("/api/products"),
        fetch("/api/inventory"),
        fetch("/api/stall/orders"),
      ]);
      if (productsRes.ok) {
        const data = await productsRes.json();
        setProducts(data.products ?? []);
      }
      if (inventoryRes.ok) {
        const data = await inventoryRes.json();
        setInventory(data.inventory ?? []);
      }
      if (ordersRes.ok) {
        const data = await ordersRes.json();
        setSelfOrders(data.orders ?? []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const SYNC_KEY = 'inventory-sync';

  const notifySync = () => {
    try {
      localStorage.setItem(SYNC_KEY, Date.now().toString());
    } catch {}
  };

  const getStock = (productId: string): number => {
    const inv = inventory.find((i) => i.product_id === productId);
    return inv?.live_stock_count ?? 0;
  };

  const openDeductDialog = (product: Product) => {
    if (getStock(product.id) <= 0) return;
    setDeductProduct(product);
    setDeductQty(1);
    setDeductReason("sale");
    setDeductDialogOpen(true);
  };

  const handleDeduct = async () => {
    if (!deductProduct || deductQty <= 0) return;
    setDeducting(true);
    try {
      const res = await fetch("/api/stall/deduct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: deductProduct.id,
          qty: deductQty,
          reason: deductReason,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "שגיאה במכירת  מלאי");
      }
      const data = await res.json();
      setInventory((prev) =>
        prev.map((inv) =>
          inv.product_id === deductProduct.id
            ? { ...inv, live_stock_count: data.remaining }
            : inv,
        ),
      );
      setDeductDialogOpen(false);
      toast({ title: "המלאי עודכן בהצלחה", variant: "success" });
      notifySync();
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "שגיאה במכירת  מלאי");
    } finally {
      setDeducting(false);
    }
  };

  const handleLogout = () => {
    document.cookie =
      "flowers_stall_auth=; Path=/; Max-Age=0; SameSite=Lax";
    router.replace("/stall");
  };

  const filteredSelfOrders = selfOrders.filter((order) => {
    const nameMatch = order.customer_name?.toLowerCase().includes(searchName.toLowerCase());
    const phoneMatch = order.customer_phone?.toLowerCase().includes(searchPhone.toLowerCase());
    return nameMatch && phoneMatch;
  });

  return (
    <PinAuthGate pinRole="STALL">
      <main className="min-h-screen bg-gradient-to-b from-background to-muted/30 p-4" dir="rtl">
        <div className="mx-auto max-w-2xl space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">ניהול דוכן</h1>
              <p className="text-sm text-muted-foreground mt-1">מכירת מלאי ישירות — ללא יצירת הזמנות</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void load()}
                disabled={loading}
                className="border-primary/20 hover:border-primary/40 hover:bg-primary/5"
              >
                <RefreshCw className={`h-4 w-4 ml-1.5 ${loading ? "animate-spin" : ""}`} />
                רענון
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                className="border-primary/20 hover:border-primary/40 hover:bg-primary/5"
              >
                <LogOut className="h-4 w-4 ms-1.5" />
                יציאה
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2 p-1 bg-muted rounded-lg w-fit">
            <button
              onClick={() => setActiveTab('selfPickup')}
              className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all ${
                activeTab === 'selfPickup'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <CheckCircle2 className="h-4 w-4" />
              ניהול איסוף עצמי
            </button>
            <button
              onClick={() => setActiveTab('liveSales')}
              className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all ${
                activeTab === 'liveSales'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <ArrowDownToLine className="h-4 w-4" />
              מכירת  מלאי דוכן
            </button>
          </div>

          {activeTab === 'selfPickup' && (
            <div className="space-y-4">
              <div className="rounded-xl border bg-card p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">חיפוש הזמנות</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="searchName" className="text-xs font-medium text-muted-foreground">חיפוש לפי שם</Label>
                    <Input
                      id="searchName"
                      value={searchName}
                      onChange={(e) => setSearchName(e.target.value)}
                      placeholder="הזן שם לקוח"
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="searchPhone" className="text-xs font-medium text-muted-foreground">חיפוש לפי טלפון</Label>
                    <Input
                      id="searchPhone"
                      value={searchPhone}
                      onChange={(e) => setSearchPhone(e.target.value)}
                      placeholder="הזן טלפון"
                      className="h-9"
                    />
                  </div>
                </div>
              </div>

              {filteredSelfOrders.length === 0 ? (
                <div className="rounded-xl border bg-card p-10 text-center shadow-sm">
                  <CheckCircle2 className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-muted-foreground text-sm">לא נמצאו הזמנות איסוף עצמי התואמות את החיפוש.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredSelfOrders.map((order) => (
                    <div key={order.id} className="rounded-xl border bg-card p-4 shadow-sm hover:shadow-md transition-all">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-semibold text-foreground truncate">{order.customer_name}</p>
                            <span className="inline-flex items-center rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                              איסוף עצמי
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground">{order.customer_phone}</p>
                          <p className="text-sm font-medium text-foreground mt-1">
                            סכום: <span className="tabular-nums">{formatILS(order.total_amount)}</span>
                          </p>
                        </div>
                        <Button
                          size="sm"
                          onClick={async () => {
                            await fetch(`/api/admin/orders/${order.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ status: "completed" }),
                            });
                            setSelfOrders((prev) => prev.filter((o) => o.id !== order.id));
                            notifySync();
                          }}
                          className="shrink-0"
                        >
                           <CheckCircle2 className="h-4 w-4 ms-1.5" />
                           דווח כנאסף
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'liveSales' && (
            <>
              {loading ? (
                <div className="flex justify-center py-20">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              ) : products.length === 0 ? (
                <div className="rounded-xl border bg-card p-10 text-center shadow-sm">
                  <ArrowDownToLine className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-muted-foreground text-sm">אין מוצרים פעילים</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {products.map((product) => {
                    const stock = getStock(product.id);
                    return (
                      <div
                        key={product.id}
                        className="rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-all"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <h2 className="text-lg font-semibold text-foreground">{product.title}</h2>
                            <p className="text-xl font-bold text-primary mt-1">{formatILS(product.price_standard)}</p>
                            <p className="text-sm font-medium text-foreground mt-2">
                              זמין למכירה: <span className="tabular-nums">{stock}</span>
                            </p>
                          </div>
                          <Button
                            size="icon"
                            onClick={() => openDeductDialog(product)}
                            disabled={stock <= 0}
                            className="shrink-0"
                          >
                            <Tag className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          <Dialog open={deductDialogOpen} onOpenChange={setDeductDialogOpen}>
            <DialogContent className="sm:max-w-md" dir="rtl">
              <DialogHeader>
                <DialogTitle className="text-xl">מכירת  מלאי</DialogTitle>
              </DialogHeader>
              {deductProduct && (
                <div className="space-y-5 pt-2">
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <p className="font-semibold text-foreground">{deductProduct.title}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      מחיר: <span className="font-medium text-foreground">{formatILS(deductProduct.price_standard)}</span>
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      זמין: <span className="font-medium text-foreground">{getStock(deductProduct.id)}</span>
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="deductQty" className="text-sm font-medium">כמות למכירה </Label>
                    <Input
                      id="deductQty"
                      type="number"
                      min={1}
                      max={getStock(deductProduct.id)}
                      value={deductQty}
                      onChange={(e) =>
                        setDeductQty(Math.max(1, parseInt(e.target.value) || 1))
                      }
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">סיבת למכירה </Label>
                    <select
                      value={deductReason}
                      onChange={(e) => setDeductReason(e.target.value as DeductReason)}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      {Object.entries(REASON_LABELS).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button
                    className="w-full h-10 text-base"
                    onClick={handleDeduct}
                    disabled={deducting}
                  >
                    {deducting ? "מעבד..." : "אשר מכירה "}
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </main>
    </PinAuthGate>
  );
}
