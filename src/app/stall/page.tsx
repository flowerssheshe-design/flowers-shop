"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Search, CheckCircle2, Tag, ArrowDownToLine, RefreshCw, Eye, MapPin } from "lucide-react";
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
  const [customPrice, setCustomPrice] = useState("");
  const [salePaymentMethod, setSalePaymentMethod] = useState<"cash" | "bit">("cash");
  const [deducting, setDeducting] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderDetailOpen, setOrderDetailOpen] = useState(false);
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
    setCustomPrice("");
    setSalePaymentMethod("cash");
    setDeductDialogOpen(true);
  };

  const handleConfirmStallAction = async () => {
    if (!deductProduct || deductQty <= 0) return;
    setDeducting(true);

    // Sales (with order creation) go through /api/stall/sale.
    // Waste/ruined items go through /api/stall/deduct (inventory only).
    const isSale = deductReason === "sale";
    const endpoint = isSale ? "/api/stall/sale" : "/api/stall/deduct";

    try {
      const body: Record<string, unknown> = {
        product_id: deductProduct.id,
        qty: deductQty,
      };

      if (isSale) {
        body.payment_method = salePaymentMethod;
        if (customPrice.trim() !== "") {
          const parsed = parseFloat(customPrice);
          if (!Number.isNaN(parsed) && parsed >= 0) {
            body.custom_price = parsed;
          }
        }
      } else {
        body.reason = deductReason;
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "שגיאה בביצוע הפעולה");
      }
      const data = await res.json();
      setInventory((prev) =>
        prev.map((inv) =>
          inv.product_id === deductProduct.id
            ? { ...inv, live_stock_count: data.remaining ?? inv.live_stock_count }
            : inv,
        ),
      );
      setDeductDialogOpen(false);
      toast({
        title: isSale ? "המכירה נרשמה בהצלחה" : "המלאי עודכן בהצלחה",
        variant: "success",
      });
      notifySync();
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "שגיאה בביצוע הפעולה");
    } finally {
      setDeducting(false);
    }
  };

  const handleLogout = () => {
    document.cookie =
      "flowers_stall_auth=; Path=/; Max-Age=0; SameSite=Lax";
    router.replace("/stall");
  };

  const openOrderDetail = (order: Order) => {
    setSelectedOrder(order);
    setOrderDetailOpen(true);
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
              <p className="text-sm text-muted-foreground mt-1">              מכירה ישירות מהמלאי — ללא יצירת הזמנות</p>
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

          <div className="flex items-center gap-2 overflow-x-auto p-1 bg-muted rounded-lg w-full sm:w-fit">
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
               מכירה במלאי בדוכן
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
                  <p className="text-muted-foreground text-sm">                  לא נמצאו הזמנות איסוף עצמי התואמות לחיפוש.</p>
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
                          <p className="text-sm text-muted-foreground mt-0.5">
                            {order.items?.map((item) => `${item.title} (${item.qty})`).join(", ")}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          onClick={async () => {
                              const res = await fetch(`/api/admin/orders/${order.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ status: "completed" }),
                              });
                              if (!res.ok) {
                                const err = await res.json().catch(() => ({}));
                                alert(err.error ?? "לא הצליח לעדכן את ההזמנה");
                                return;
                              }
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
                <DialogTitle className="text-xl">
                  {deductReason === "sale" ? "מכירת דוכן" : "קיזוז מלאי"}
                </DialogTitle>
              </DialogHeader>
              {deductProduct && (
                <div className="space-y-5 pt-2">
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <p className="font-semibold text-foreground">{deductProduct.title}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      מחיר יחידני: <span className="font-medium text-foreground">{formatILS(deductProduct.price_standard)}</span>
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      זמין: <span className="font-medium text-foreground">{getStock(deductProduct.id)}</span>
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="deductQty" className="text-sm font-medium">כמות</Label>
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
                    <Label className="text-sm font-medium">סיבה</Label>
                    <select
                      value={deductReason}
                      onChange={(e) => {
                        setDeductReason(e.target.value as DeductReason);
                        setCustomPrice("");
                        setSalePaymentMethod("cash");
                      }}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      {Object.entries(REASON_LABELS).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {deductReason === "sale" && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="customPrice" className="text-sm font-medium">                        מחיר יחידני (אופציונלי) — ריק ישתמש במחיר יבשתי</Label>
                        <Input
                          id="customPrice"
                          type="number"
                          min={0}
                          step={0.01}
                          placeholder={formatILS(deductProduct.price_standard)}
                          value={customPrice}
                          onChange={(e) => setCustomPrice(e.target.value)}
                          className="h-10"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">                        אמצעי תשלום</Label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setSalePaymentMethod("cash")}
                            className={`rounded-xl border p-3 text-sm font-medium transition ${
                              salePaymentMethod === "cash"
                                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                                : "border-primary/15 bg-card hover:bg-accent"
                            }`}
                          >
                            מזומן
                          </button>
                          <button
                            type="button"
                            onClick={() => setSalePaymentMethod("bit")}
                            className={`rounded-xl border p-3 text-sm font-medium transition ${
                              salePaymentMethod === "bit"
                                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                                : "border-primary/15 bg-card hover:bg-accent"
                            }`}
                          >
                            ביט
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                  <Button
                    className="w-full h-10 text-base"
                    onClick={handleConfirmStallAction}
                    disabled={deducting}
                  >
                    {deducting ? "מעבד..." : deductReason === "sale" ? "אשר מכירה" : "אשר קיזוז"}
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
          <Dialog open={orderDetailOpen} onOpenChange={setOrderDetailOpen}>
            <DialogContent 
              dir="rtl" 
              className="fixed left-1/2 right-auto top-1/2 -translate-x-1/2 -translate-y-1/2 sm:max-w-xl w-[95vw] max-h-[85vh] p-0 gap-0 overflow-hidden rounded-xl border border-stone-200 shadow-xl"
            >
              <DialogHeader className="p-4 border-b border-stone-200 bg-stone-50/50 sticky top-0 z-10">
                <DialogTitle className="text-xl font-semibold text-center text-stone-800">
                  פרטי הזמנה
                </DialogTitle>
              </DialogHeader>
              <div className="overflow-y-auto max-h-[calc(85vh-65px)] p-6 space-y-6">
                {selectedOrder && (
                  <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-right">
                    <div>
                      <p className="text-xs text-stone-500 block mb-0.5">שם לקוח</p>
                      <p className="font-medium text-stone-900">{selectedOrder.customer_name || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-stone-500 block mb-0.5">טלפון</p>
                      <p className="font-medium text-stone-900 dir-ltr text-right block">
                        {selectedOrder.customer_phone || '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-stone-500 block mb-0.5">צורת משלוח</p>
                      <p className="font-medium text-stone-900">
                        {selectedOrder.delivery_type === 'delivery' ? 'משלוח' : 'איסוף עצמי'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-stone-500 block mb-0.5">אמצעי תשלום</p>
                      <p className="font-medium text-stone-900">
                        {selectedOrder.payment_method === 'bit'
                          ? 'ביט'
                          : selectedOrder.payment_method === 'paybox'
                          ? 'PayBox'
                          : selectedOrder.payment_method === 'cash'
                          ? 'מזומנ'
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-stone-500 block mb-0.5">כתובת</p>
                        {selectedOrder.delivery_address ? (
                          <a
                            href={`geo:0,0?q=${encodeURIComponent(selectedOrder.delivery_address)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-start gap-2 font-medium text-stone-900 hover:text-primary hover:underline"
                          >
                            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-stone-400" />
                            <span>{selectedOrder.delivery_address}</span>
                          </a>
                        ) : (
                          <p className="font-medium text-stone-900">—</p>
                        )}
                    </div>
                    <div>
                      <p className="text-xs text-stone-500 block mb-0.5">שהף לתשלום</p>
                      <p className="font-semibold text-emerald-700 text-lg">
                        {formatILS(selectedOrder.total_amount)}
                      </p>
                    </div>
                    {selectedOrder.notes && (
                      <div className="col-span-2 pt-2 border-t border-stone-100">
                        <p className="text-xs text-stone-500 block mb-0.5">הערות</p>
                        <p className="text-sm text-stone-700 bg-stone-50 p-2.5 rounded-lg border border-stone-100">
                          {selectedOrder.notes}
                        </p>
                      </div>
                    )}
                    {selectedOrder.greeting_note && (
                      <div className="col-span-2 pt-2 border-t border-stone-100">
                        <p className="text-xs text-stone-500 block mb-0.5">ברכה / מכתב</p>
                        <p className="text-sm text-stone-700 bg-stone-50 p-2.5 rounded-lg border border-stone-100">
                          {selectedOrder.greeting_note}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>

        </div>
      </main>
    </PinAuthGate>
  );
}
