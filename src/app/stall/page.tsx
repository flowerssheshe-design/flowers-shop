"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Search, CheckCircle2, Tag, ArrowDownToLine, RefreshCw, Eye, MapPin, X, Package, Minus, Plus, Trash2, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { formatILS, isStallSaleOrder } from "@/lib/utils";
import { useToast } from "@/components/ui/toaster";
import type { Product, Inventory, Order } from "@/types";
import PinAuthGate from "@/components/PinAuthGate";
import { NotesPopover } from "@/components/NotesPopover";

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
  const [activeTab, setActiveTab] = useState<'selfPickup' | 'delivery' | 'liveSales' | 'inventory'>('liveSales');
  const [selfOrders, setSelfOrders] = useState<Order[]>([]);
  const [deliveryOrders, setDeliveryOrders] = useState<Order[]>([]);
  const [searchName, setSearchName] = useState('');
  const [searchPhone, setSearchPhone] = useState('');
  const [deliverySearchName, setDeliverySearchName] = useState('');
  const [deliverySearchPhone, setDeliverySearchPhone] = useState('');

  const [draftStock, setDraftStock] = useState<Record<string, number>>({});
  const [editingStock, setEditingStock] = useState<Record<string, boolean>>({});
  const [savingStock, setSavingStock] = useState<Record<string, boolean>>({});

  const [deductDialogOpen, setDeductDialogOpen] = useState(false);
  const [deductProduct, setDeductProduct] = useState<Product | null>(null);
  const [deductQty, setDeductQty] = useState(1);
  const [deductReason, setDeductReason] = useState<DeductReason>("sale");
  const [customPrice, setCustomPrice] = useState("");
  const [salePaymentMethod, setSalePaymentMethod] = useState<"cash" | "bit">("cash");
  const [deducting, setDeducting] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderDetailOpen, setOrderDetailOpen] = useState(false);
  const [stallSales, setStallSales] = useState<Order[]>([]);
  const [showSalesHistory, setShowSalesHistory] = useState(false);
  const [deletingSaleId, setDeletingSaleId] = useState<string | null>(null);
  const { toast } = useToast();

  const handleAuthError = useCallback(() => {
    document.cookie = "flowers_stall_auth=; Path=/; Max-Age=0; SameSite=Lax";
    window.location.reload();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [productsRes, inventoryRes, ordersRes, salesRes] = await Promise.all([
        fetch("/api/products"),
        fetch("/api/inventory"),
        fetch("/api/stall/orders"),
        fetch("/api/stall/sales"),
      ]);
      if (
        productsRes.status === 401 ||
        inventoryRes.status === 401 ||
        ordersRes.status === 401 ||
        salesRes.status === 401
      ) {
        handleAuthError();
        return;
      }
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
        const orders = (data.orders ?? []) as Order[];
        setSelfOrders(
          orders.filter(
            (o) => o.delivery_type === 'pickup' && !isStallSaleOrder(o),
          ),
        );
        setDeliveryOrders(orders.filter(o => o.delivery_type === 'delivery'));
      }
      if (salesRes.ok) {
        const data = await salesRes.json();
        setStallSales((data.sales ?? []) as Order[]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [handleAuthError]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === SYNC_KEY && e.newValue) {
        void load();
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [load]);

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

  const updateInventory = async (productId: string, kind: "delta" | "set", value: number) => {
    setSavingStock((prev) => ({ ...prev, [productId]: true }));
    try {
      const body: Record<string, unknown> = { product_id: productId };
      if (kind === "delta") {
        body.delta = value;
      } else {
        body.live_stock_count = Math.max(0, value);
      }
      const res = await fetch("/api/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        handleAuthError();
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "עדכון המלאי נכשל");
      }
      const data = await res.json();
      const updated = (data as { inventory?: Inventory }).inventory;
      if (updated) {
        setInventory((prev) =>
          prev.map((inv) => (inv.product_id === productId ? updated : inv)),
        );
      }
      notifySync();
      toast({
        title: "המלאי עודכן בהצלחה",
        variant: "success",
      });
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "שגיאה בעדכון המלאי");
    } finally {
      setSavingStock((prev) => ({ ...prev, [productId]: false }));
    }
  };

  const changeStock = async (productId: string, delta: number) => {
    await updateInventory(productId, "delta", delta);
  };

  const toggleStock = async (product: Product) => {
    const stock = getStock(product.id);
    const inv = inventory.find((i) => i.product_id === product.id);
    const initial = Math.max(0, inv?.initial_stock_count ?? 0);
    if (stock > 0) {
      await updateInventory(product.id, "set", 0);
    } else {
      await updateInventory(product.id, "set", initial > 0 ? initial : 1);
    }
  };

  const handleStockInputChange = (productId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseInt(e.target.value, 10);
    if (Number.isNaN(v)) return;
    setDraftStock((prev) => ({ ...prev, [productId]: Math.max(0, v) }));
  };

  const handleStockSave = async (productId: string) => {
    const current = getStock(productId);
    const target = draftStock[productId] ?? current;
    if (target === current) {
      setEditingStock((prev) => { const next = { ...prev }; delete next[productId]; return next; });
      return;
    }
    setEditingStock((prev) => { const next = { ...prev }; delete next[productId]; return next; });
    setDraftStock((prev) => { const next = { ...prev }; delete next[productId]; return next; });
    await updateInventory(productId, "set", target);
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
      if (res.status === 401) {
        handleAuthError();
        return;
      }
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
    localStorage.removeItem("flowers_stall_passcode");
    sessionStorage.removeItem("flowers_stall_passcode");
    window.dispatchEvent(new Event("stall:unauth"));
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

  const filteredDeliveryOrders = deliveryOrders.filter((order) => {
    const nameMatch = order.customer_name?.toLowerCase().includes(deliverySearchName.toLowerCase());
    const phoneMatch = order.customer_phone?.toLowerCase().includes(deliverySearchPhone.toLowerCase());
    return nameMatch && phoneMatch;
  });

  const getPaymentMethodLabel = (method?: string) => {
    switch (method) {
      case 'bit': return 'ביט';
      case 'paybox': return 'PayBox';
      case 'cash': return 'מזומן';
      default: return '—';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'approved': return 'מאושר';
      case 'completed': return 'הושלם';
      case 'pending_payment': return 'ממתין לתשלום';
      case 'cancelled': return 'בוטל';
      default: return status;
    }
  };

  const handleOrderStatusChange = async (order: Order, newStatus: string) => {
    try {
      const res = await fetch(`/api/stall/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.status === 401) {
        handleAuthError();
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error ?? "לא הצליח לעדכן את ההזמנה");
        return;
      }
      // Update both lists
      setSelfOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, status: newStatus as Order['status'] } : o))
      );
      setDeliveryOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, status: newStatus as Order['status'] } : o))
      );
      notifySync();
      toast({
        title: newStatus === 'completed' ? "ההזמנה סומנה כהושלמה" : "ההזמנה הוחזרה לפעילה",
        variant: "success",
      });
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "שגיאה בעדכון ההזמנה");
    }
  };

  const handleDeleteSale = async (order: Order) => {
    if (!confirm("האם למחוק מכירה זו?")) {
      return;
    }
    setDeletingSaleId(order.id);
    try {
      const res = await fetch(`/api/stall/sales/${order.id}`, {
        method: "DELETE",
      });
      if (res.status === 401) {
        handleAuthError();
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "מחיקת המכירה נכשלה");
      }
      setStallSales((prev) => prev.filter((o) => o.id !== order.id));
      void load();
      toast({
        title: "המכירה נמחקה והמלאי חודש",
        variant: "success",
      });
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "שגיאה במחיקת המכירה");
    } finally {
      setDeletingSaleId(null);
    }
  };

  const renderOrderCard = (
    order: Order,
    ordersType: 'selfPickup' | 'delivery',
    isDeliveryTab: boolean
  ) => {
    const isCompleted = order.status === 'completed';
    const canModify = ordersType === 'selfPickup';

    return (
      <div key={order.id} className="rounded-xl border bg-card p-4 shadow-sm hover:shadow-md transition-all">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-foreground truncate">{order.customer_name}</p>
              <span className="inline-flex items-center rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 whitespace-nowrap">
                {order.delivery_type === 'pickup' ? 'איסוף עצמי' : 'משלוח'}
              </span>
              <span className="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300 whitespace-nowrap">
                {getStatusLabel(order.status)}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{order.customer_phone}</p>
            <p className="text-sm font-medium text-foreground">
              סכום: <span className="tabular-nums">{formatILS(order.total_amount)}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              {order.items?.map((item) => `${item.title} (${item.qty})`).join(", ")}
            </p>
            <p className="text-sm text-muted-foreground">
              שיטת תשלום: <span className="font-medium text-foreground">{getPaymentMethodLabel(order.payment_method)}</span>
            </p>
            {order.notes && (
              <div className="text-sm text-muted-foreground">
                הערות: <NotesPopover notes={order.notes} trigger={<span className="font-medium text-foreground">{order.notes}</span>} />
              </div>
            )}
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0 w-full sm:w-auto">
            {canModify && isCompleted && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleOrderStatusChange(order, 'approved')}
                className="border-amber-300 text-amber-700 hover:bg-amber-50 w-full sm:w-auto justify-center"
              >
                <RefreshCw className="h-4 w-4 ms-1.5" />
                <span className="hidden sm:inline">בטל אישור</span>
                <span className="sm:hidden" aria-label="בטל אישור">ביטול</span>
              </Button>
            )}
            {canModify && !isCompleted && (
              <Button
                size="sm"
                onClick={async () => {
                  await handleOrderStatusChange(order, 'completed');
                }}
                className="w-full sm:w-auto justify-center"
              >
                <CheckCircle2 className="h-4 w-4 ms-1.5" />
                <span className="hidden sm:inline">הושלם (נאסוף / נשלח)</span>
                <span className="sm:hidden" aria-label="סמן כהושלם">הושלם</span>
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => openOrderDetail(order)}
              className="w-full sm:w-auto justify-center"
            >
              <Eye className="h-4 w-4 ms-1.5" />
              <span className="hidden sm:inline">צפייה</span>
              <span className="sm:hidden" aria-label="צפייה בפרטים">פרטים</span>
            </Button>
          </div>
        </div>
      </div>
    );
  };

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
              איסוף עצמי
            </button>
            <button
              onClick={() => setActiveTab('delivery')}
              className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all ${
                activeTab === 'delivery'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <MapPin className="h-4 w-4" />
              הזמנות למשלוח
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
                  <p className="text-muted-foreground text-sm">לא נמצאו הזמנות איסוף עצמי התואמות לחיפוש.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredSelfOrders.map((order) =>
                    renderOrderCard(order, 'selfPickup', false)
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'delivery' && (
            <div className="space-y-4">
              <div className="rounded-xl border bg-card p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">חיפוש הזמנות</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="deliverySearchName" className="text-xs font-medium text-muted-foreground">חיפוש לפי שם</Label>
                    <Input
                      id="deliverySearchName"
                      value={deliverySearchName}
                      onChange={(e) => setDeliverySearchName(e.target.value)}
                      placeholder="הזן שם לקוח"
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="deliverySearchPhone" className="text-xs font-medium text-muted-foreground">חיפוש לפי טלפון</Label>
                    <Input
                      id="deliverySearchPhone"
                      value={deliverySearchPhone}
                      onChange={(e) => setDeliverySearchPhone(e.target.value)}
                      placeholder="הזן טלפון"
                      className="h-9"
                    />
                  </div>
                </div>
              </div>

              {filteredDeliveryOrders.length === 0 ? (
                <div className="rounded-xl border bg-card p-10 text-center shadow-sm">
                  <MapPin className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-muted-foreground text-sm">לא נמצאו הזמנות משלוח התואמות לחיפוש.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredDeliveryOrders.map((order) =>
                    renderOrderCard(order, 'delivery', true)
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'liveSales' && (
            <>
              <div className="flex items-center gap-2 mb-4">
                <button
                  onClick={() => setShowSalesHistory(false)}
                  className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all ${
                    !showSalesHistory
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <ArrowDownToLine className="h-4 w-4" />
                  מכירה במלאי בדוכן
                </button>
                <button
                  onClick={() => setShowSalesHistory(true)}
                  className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all ${
                    showSalesHistory
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <History className="h-4 w-4" />
                  היסטוריית מכירות
                </button>
              </div>

              {!showSalesHistory ? (
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
                                 <p className="text-sm font-medium text-foreground mt-2 flex items-center gap-2">
                                   זמין למכירה: <span className="tabular-nums">{stock}</span>
                                   <button
                                     type="button"
                                     onClick={() => void changeStock(product.id, 1)}
                                     disabled={savingStock[product.id]}
                                     className="inline-flex items-center justify-center h-6 w-6 rounded-md border text-xs hover:bg-muted disabled:opacity-50"
                                   >
                                     <Plus className="h-3 w-3" />
                                   </button>
                                   <button
                                     type="button"
                                     onClick={() => void changeStock(product.id, -1)}
                                     disabled={savingStock[product.id] || stock <= 0}
                                     className="inline-flex items-center justify-center h-6 w-6 rounded-md border text-xs hover:bg-muted disabled:opacity-50"
                                   >
                                     <Minus className="h-3 w-3" />
                                   </button>
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
              ) : (
                <div className="rounded-xl border bg-card p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h2 className="text-lg font-semibold text-foreground">היסטוריית מכירות דוכן</h2>
                      <p className="text-sm text-muted-foreground mt-1">
                        מכירות ישירות שבוצעו בדוכן
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void load()}
                      disabled={loading}
                      className="border-primary/20 hover:border-primary/40 hover:bg-primary/5"
                    >
                      <RefreshCw className={`h-4 w-4 ml-1.5 ${loading ? "animate-spin" : ""}`} />
                      רענון
                    </Button>
                  </div>

                  {stallSales.length === 0 ? (
                    <div className="rounded-xl border bg-card p-10 text-center shadow-sm">
                      <History className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                      <p className="text-muted-foreground text-sm">לא בוצעו עדיין מכירות בדוכן.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                          <tr>
                            <th className="p-3 text-start">תאריך</th>
                            <th className="p-3 text-start">פריטים וכמות</th>
                            <th className="p-3 text-start">סכום כולל</th>
                            <th className="p-3 text-start">אמצעי תשלום</th>
                            <th className="p-3 text-start">פעולות</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stallSales.map((sale) => {
                            const items = Array.isArray(sale.items) ? sale.items : [];
                            return (
                              <tr key={sale.id} className="border-t align-top">
                                <td className="p-3 whitespace-nowrap text-muted-foreground">
                                  {new Date(sale.created_at).toLocaleString("he-IL")}
                                </td>
                                <td className="p-3">
                                  {items.map((it) => `${it.title} ×${it.qty}`).join(", ") || "—"}
                                </td>
                                <td className="p-3 font-semibold tabular-nums text-foreground">
                                  {formatILS(sale.total_amount)}
                                </td>
                                <td className="p-3 text-muted-foreground">
                                  {getPaymentMethodLabel(sale.payment_method)}
                                </td>
                                <td className="p-3">
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => handleDeleteSale(sale)}
                                    disabled={deletingSaleId === sale.id}
                                  >
                                    {deletingSaleId === sale.id ? "מוחק..." : "מחק מכירה"}
                                    <Trash2 className={`ml-2 ${deletingSaleId === sale.id ? "animate-spin" : ""}`} />
                                  </Button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {activeTab === 'inventory' && (
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between sm:flex-wrap sm:gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">ניהול מלאי בדוכן</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    עדכון כמות במלאי בזמן אמת לכל המוצרים הפעילים
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void load()}
                  disabled={loading}
                  className="border-primary/20 hover:border-primary/40 hover:bg-primary/5"
                >
                  <RefreshCw className={`h-4 w-4 ml-1.5 ${loading ? "animate-spin" : ""}`} />
                  רענון
                </Button>
              </div>

              {loading ? (
                <div className="flex justify-center py-20">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              ) : products.length === 0 ? (
                <div className="rounded-xl border bg-card p-10 text-center shadow-sm">
                  <Package className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-muted-foreground text-sm">אין מוצרים פעילים לניהול מלאי.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {products.map((product) => {
                    const stock = getStock(product.id);
                    const inv = inventory.find((i) => i.product_id === product.id);
                    const initial = inv?.initial_stock_count ?? 0;
                    const draft = draftStock[product.id] ?? stock;
                    const isEditing = editingStock[product.id] === true;
                    const saving = savingStock[product.id];

                    return (
                      <div
                        key={product.id}
                        className="rounded-xl border bg-card p-4 shadow-sm hover:shadow-md transition-all"
                      >
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-foreground truncate">
                              {product.title}
                            </p>
                            <p className="text-xs text-muted-foreground dir-ltr">
                              {formatILS(product.price_standard)}
                            </p>
                          </div>
                          <span
                            className={`text-xs font-medium tabular-nums border px-2.5 py-1 rounded ${
                              stock > 0
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-rose-200 bg-rose-50 text-rose-700"
                            }`}
                          >
                            מלאי: {stock}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                          <button
                            type="button"
                            onClick={() => changeStock(product.id, -1)}
                            disabled={stock <= 0 || saving}
                            aria-label="הסר יחידה מהמלאי"
                            className="flex items-center justify-center shrink-0 rounded-xl border border-input bg-background p-1 text-sm font-medium transition-colors min-w-[44px] min-h-[44px] disabled:opacity-50 disabled:pointer-events-none hover:bg-accent"
                          >
                            <Minus className="h-4 w-4" />
                            <span className="hidden sm:inline">מינוס יחידה</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => changeStock(product.id, 1)}
                            disabled={saving}
                            aria-label="הוסף יחידה למלאי"
                            className="flex items-center justify-center shrink-0 rounded-xl border border-input bg-background p-1 text-sm font-medium transition-colors min-w-[44px] min-h-[44px] disabled:opacity-50 disabled:pointer-events-none hover:bg-accent"
                          >
                            <Plus className="h-4 w-4" />
                            <span className="hidden sm:inline">הוסף יחידה</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleStock(product)}
                            disabled={saving}
                            aria-label={stock > 0 ? "סמן כאזל מהמלאי" : "סמן כבמלאי"}
                            className="flex items-center justify-center shrink-0 rounded-xl border border-input bg-background px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none hover:bg-accent whitespace-nowrap"
                          >
                            {stock > 0 ? "אזל מהמלאי" : "במלאי"}
                          </button>
                          {isEditing ? (
                            <>
                              <input
                                type="number"
                                min="0"
                                value={draft}
                                onChange={(e) => handleStockInputChange(product.id, e)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") void handleStockSave(product.id);
                                  if (e.key === "Escape") {
                                    setEditingStock((prev) => {
                                      const next = { ...prev };
                                      delete next[product.id];
                                      return next;
                                    });
                                    setDraftStock((prev) => {
                                      const next = { ...prev };
                                      delete next[product.id];
                                      return next;
                                    });
                                  }
                                }}
                                className="w-20 h-9 text-center border rounded-md bg-background px-2 text-sm"
                              />
                              <button
                                type="button"
                                onClick={() => void handleStockSave(product.id)}
                                disabled={saving || draft === stock}
                                className="flex items-center justify-center shrink-0 rounded-xl border border-input bg-background px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none hover:bg-accent whitespace-nowrap"
                              >
                                שמור
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingStock((prev) => {
                                    const next = { ...prev };
                                    delete next[product.id];
                                    return next;
                                  });
                                  setDraftStock((prev) => {
                                    const next = { ...prev };
                                    delete next[product.id];
                                    return next;
                                  });
                                }}
                                disabled={saving}
                                className="flex items-center justify-center shrink-0 rounded-xl border border-input bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors disabled:opacity-50 disabled:pointer-events-none hover:bg-accent whitespace-nowrap"
                              >
                                ביטול
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingStock((prev) => ({ ...prev, [product.id]: true }));
                                setDraftStock((prev) => ({ ...prev, [product.id]: stock }));
                              }}
                              disabled={saving}
                              className="flex items-center justify-center shrink-0 rounded-xl border border-input bg-background px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none hover:bg-accent whitespace-nowrap"
                              aria-label="עריכת כמות מלאי"
                            >
                              עריכה
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <Dialog open={deductDialogOpen} onOpenChange={setDeductDialogOpen}>
            <DialogContent 
              showDefaultClose={false}
              dir="rtl"
              className="fixed left-0 right-0 bottom-0 top-auto z-[70] w-full max-w-md mx-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:-translate-y-1/2 sm:max-w-md sm:rounded-xl sm:shadow-xl border border-stone-200 bg-background p-0 gap-0 overflow-hidden"
            >
              <div className="sticky top-0 z-10 flex items-center justify-between gap-2 p-4 border-b border-stone-200 bg-stone-50/50 sm:rounded-t-xl">
                <DialogTitle className="text-xl font-semibold text-center text-stone-800 flex-1">
                  {deductReason === "sale" ? "מכירת דוכן" : "קיזוז מלאי"}
                </DialogTitle>
                <DialogClose className="flex items-center justify-center w-10 h-10 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 hover:text-stone-900 transition-colors shrink-0" aria-label="סגור">
                  <X className="h-5 w-5" />
                </DialogClose>
              </div>
              {deductProduct && (
                <div className="overflow-y-auto max-h-[calc(100vh-120px)] sm:max-h-[80vh] space-y-5 p-4 sm:p-6 pt-2">
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
                        <Label className="text-sm font-medium">אמצעי תשלום</Label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
              showDefaultClose={false}
              className="fixed left-0 right-0 bottom-0 top-auto z-[70] w-full max-w-md mx-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:-translate-y-1/2 sm:max-w-xl sm:rounded-xl sm:shadow-xl border border-stone-200 bg-background p-0 gap-0 overflow-hidden"
            >
              <div className="sticky top-0 z-10 flex items-center justify-between gap-2 p-4 border-b border-stone-200 bg-stone-50/50 sm:rounded-t-xl">
                <DialogTitle className="text-xl font-semibold text-center text-stone-800 flex-1">
                  פרטי הזמנה
                </DialogTitle>
                <DialogClose className="flex items-center justify-center w-10 h-10 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 hover:text-stone-900 transition-colors shrink-0" aria-label="סגור">
                  <X className="h-5 w-5" />
                </DialogClose>
              </div>
              <div className="overflow-y-auto max-h-[calc(100vh-120px)] sm:max-h-[calc(85vh-65px)] p-4 sm:p-6 space-y-6">
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
