"use client";

import { useEffect, useMemo, useState } from "react";
import { LogOut, Loader2, MessageSquare, Copy, Download, Truck, Package, ClipboardList, TrendingUp, RefreshCw, Archive, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { clearAdminAuth, isAdminAuthenticated } from "@/components/AdminGate";
import { AdminNav } from "@/components/AdminNav";
import { formatILS } from "@/lib/utils";
import { useToast } from "@/components/ui/toaster";
import {
  buildSupplierMessage,
  buildSupplierTextFile,
  getWeekBoundaries,
} from "@/lib/supplier-message";
import type { Product, SupplierAggregate, WeeklyArchive } from "@/types";

type SummaryRow = {
  product_id: string;
  title: string;
  price_standard: number;
  cost_price: number;
  live_stock_count: number;
  initial_stock_count: number;
  approved_orders: number;
  admin_extra: number;
};

type PreOrderItem = {
  product_id: string;
  title: string;
  price_standard: number;
  cost_price: number;
  approved_orders: number;
  pickup_total: number;
  delivery_total: number;
  pickup_completed: number;
  pickup_pending: number;
  delivery_completed: number;
  delivery_pending: number;
  revenue: number;
  profit: number;
};

export default function AdminInventoryPage() {
  const [ready, setReady] = useState(false);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'preOrders' | 'liveStock' | 'supplier' | 'archives'>('preOrders');
  const [preOrderData, setPreOrderData] = useState<PreOrderItem[]>([]);
  const [supplier, setSupplier] = useState<SupplierAggregate[]>([]);
  const [supplierAdjustments, setSupplierAdjustments] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [archives, setArchives] = useState<WeeklyArchive[]>([]);
  const [selectedArchive, setSelectedArchive] = useState<WeeklyArchive | null>(null);
  const [archivesLoading, setArchivesLoading] = useState(false);
  const { toast } = useToast();
  const weekBounds = useMemo(() => getWeekBoundaries(), []);
  const supplierMessage = useMemo(
    () =>
      buildSupplierMessage({
        aggregates: supplier
          .map((s) => ({
            ...s,
            total_qty: Math.max(0, s.total_qty + (supplierAdjustments[s.product_id] ?? 0)),
          }))
          .filter((a) => a.total_qty > 0),
        weekStart: weekBounds.weekStart,
        weekEnd: weekBounds.weekEnd,
      }),
    [supplier, supplierAdjustments, weekBounds],
  );

  const stallCost = useMemo(() => summary.reduce((sum, r) => {
    const initial = Math.max(0, r.initial_stock_count);
    return sum + initial * r.cost_price;
  }, 0), [summary]);

  const stallRevenue = useMemo(() => summary.reduce((sum, r) => {
    const initial = Math.max(0, r.initial_stock_count);
    const sold = Math.max(0, initial - r.live_stock_count);
    return sum + sold * r.price_standard;
  }, 0), [summary]);

  const stallProfit = stallRevenue - stallCost;

  const stallSellThrough = useMemo(() => {
    let totalInitial = 0;
    let totalSold = 0;
    summary.forEach((r) => {
      const initial = Math.max(0, r.initial_stock_count);
      totalInitial += initial;
      totalSold += Math.max(0, initial - r.live_stock_count);
    });
    if (totalInitial <= 0) return 0;
    return (totalSold / totalInitial) * 100;
  }, [summary]);

  const preorderStats = useMemo(() => {
    let units = 0;
    let revenue = 0;
    let profit = 0;
    let cost = 0;
    preOrderData.forEach((p) => {
      units += p.approved_orders;
      revenue += p.revenue;
      profit += p.profit;
      cost += p.approved_orders * p.cost_price;
    });
    return { units, revenue, profit, cost };
  }, [preOrderData]);

  const preorderSellThrough = useMemo(() => {
    let collected = 0;
    let ordered = 0;
    preOrderData.forEach((p) => {
      collected += p.pickup_completed + p.delivery_completed;
      ordered += p.approved_orders;
    });
    if (ordered <= 0) return 0;
    return (collected / ordered) * 100;
  }, [preOrderData]);

  const preOrderTotals = useMemo(
    () =>
      preOrderData.reduce(
        (acc, p) => {
          acc.units += p.approved_orders;
          acc.pickup_total += p.pickup_total;
          acc.delivery_total += p.delivery_total;
          acc.pickup_completed += p.pickup_completed;
          acc.pickup_pending += p.pickup_pending;
          acc.delivery_completed += p.delivery_completed;
          acc.delivery_pending += p.delivery_pending;
          acc.cost += p.approved_orders * p.cost_price;
          acc.revenue += p.revenue;
          acc.profit += p.profit;
          return acc;
        },
        {
          units: 0,
          pickup_total: 0,
          delivery_total: 0,
          pickup_completed: 0,
          pickup_pending: 0,
          delivery_completed: 0,
          delivery_pending: 0,
          cost: 0,
          revenue: 0,
          profit: 0,
        },
      ),
    [preOrderData],
  );

  const totalProfit = stallProfit + preorderStats.profit;

  useEffect(() => {
    if (!isAdminAuthenticated()) {
      window.location.replace("/admin");
      return;
    }
    setReady(true);
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [productsRes, inventoryRes, ordersRes, supplierRes] = await Promise.all([
        fetch("/api/admin/products", { cache: "no-store" }).then((r) => r.ok ? r.json() : { products: [] as Product[] }),
        fetch("/api/admin/inventory/summary", { cache: "no-store" }).then((r) => r.ok ? r.json() : { summary: [] as SummaryRow[] }),
        fetch("/api/admin/orders", { cache: "no-store" }).then((r) => r.ok ? r.json() : { orders: [] as any[] }),
        fetch("/api/admin/supplier-week", { cache: "no-store" }).then((r) => r.ok ? r.json() : { aggregates: [] as SupplierAggregate[] }),
      ]);
      const products: Product[] = productsRes.products ?? [];
      setProducts(products);
      const productMap = new Map(products.map((p) => [p.id, p]));
      const inventorySummary: SummaryRow[] = inventoryRes.summary ?? [];
      const ordersData: any[] = ordersRes.orders ?? [];
      const supplierData: SupplierAggregate[] = supplierRes.aggregates ?? [];

      const preOrderAgg: Record<string, PreOrderItem> = ordersData.reduce((acc, order) => {
        const items = Array.isArray(order.items) ? order.items : [];
        if (items.length === 0) return acc;
        items.forEach((item: any) => {
          const prod = productMap.get(item.productId);
          if (!prod) return;
          const entry = acc[prod.id] || {
            product_id: prod.id,
            title: prod.title,
            price_standard: prod.price_standard,
            cost_price: prod.cost_price,
            approved_orders: 0,
            pickup_total: 0,
            delivery_total: 0,
            pickup_completed: 0,
            pickup_pending: 0,
            delivery_completed: 0,
            delivery_pending: 0,
            revenue: 0,
            profit: 0,
          };
          const qty = item.qty || 0;
          const isActive = order.status === "approved" || order.status === "completed";
          if (!isActive) return;
          entry.approved_orders += qty;
          if (order.delivery_type === "pickup") {
            entry.pickup_total += qty;
            if (order.status === "completed") {
              entry.pickup_completed += qty;
            } else {
              entry.pickup_pending += qty;
            }
          } else {
            entry.delivery_total += qty;
            if (order.status === "completed") {
              entry.delivery_completed += qty;
            } else {
              entry.delivery_pending += qty;
            }
          }
          entry.revenue = entry.approved_orders * prod.price_standard;
          entry.profit = entry.approved_orders * Math.max(0, prod.price_standard - prod.cost_price);
          acc[prod.id] = entry;
        });
        return acc;
      }, {} as Record<string, PreOrderItem>);

      const preOrderList = Object.values(preOrderAgg).sort((a, b) => a.title.localeCompare(b.title));
      setPreOrderData(preOrderList);

      const activeProducts = products.filter((p) => p.is_active);
      const aggregateMap = new Map(supplierData.map((a) => [a.product_id, a]));
      const merged: SupplierAggregate[] = activeProducts.map((p) => {
        const existing = aggregateMap.get(p.id);
        return existing ?? { product_id: p.id, title: p.title, total_qty: 0 };
      });
      setSupplier(merged);

      setSummary(inventorySummary);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setLoading(false);
    }
  }

  const SYNC_KEY = 'inventory-sync';

  const notifySync = () => {
    try {
      localStorage.setItem(SYNC_KEY, Date.now().toString());
    } catch {}
  };

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === SYNC_KEY && e.newValue) {
        load();
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  useEffect(() => {
    if (activeTab === 'archives') {
      void loadArchives();
    }
  }, [activeTab]);

  async function confirmSupplierOrder() {
    if (!products.length) return;
    if (!confirm("אשר הזמנת ספק?\nההודעה לספק תכלול את סך ההזמנות מראש + תוספת ידוכן.\nהמלאי הראשוני לדוכן יקבע לפי התוספת הידנית בלבד (הזמנות מראש לא נכללות במלאי הדוכן). מוצרים ללא תוספת יקבלו 0.")) return;
    setLoading(true);
    try {
      const supplierMap = new Map(supplier.map((s) => [s.product_id, s]));
      const activeProducts = products.filter((p) => p.is_active);
      const productMap = new Map(products.map((p) => [p.id, p]));
      const confirmedQuantities = new Map<string, number>();

      for (const p of activeProducts) {
        const s = supplierMap.get(p.id);
        const adjustment = supplierAdjustments[p.id] ?? 0;
        const qty = s ? Math.max(0, adjustment) : 0;
        confirmedQuantities.set(p.id, qty);
        await fetch("/api/inventory", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ product_id: p.id, live_stock_count: qty, initial_stock_count: qty }),
        });
      }

      toast({ title: "המלאי אופס ועודכן לפי הזמנת הספק", variant: "success" });

      const updatedSupplier = activeProducts.map((p) => ({
        product_id: p.id,
        title: productMap.get(p.id)?.title ?? p.title,
        total_qty: 0,
      }));
      setSupplier(updatedSupplier);
      setSupplierAdjustments({});

      await load();
      setSupplier(updatedSupplier);

      notifySync();
    } catch {
      toast({ title: "עדכון מלאי נכשל", variant: "error" });
    } finally {
      setLoading(false);
    }
  }

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(supplierMessage);
      toast({ title: "ההודעה הועתקה בהצלחה", variant: "success" });
    } catch {
      toast({ title: "העתקה נכשלה", variant: "error" });
    }
  }

  function downloadMessage() {
    const text =
      "\uFEFF" +
      buildSupplierTextFile({
        aggregates: supplier
          .map((s) => ({
            ...s,
            total_qty: Math.max(0, s.total_qty + (supplierAdjustments[s.product_id] ?? 0)),
          }))
          .filter((a) => a.total_qty > 0),
        weekStart: weekBounds.weekStart,
        weekEnd: weekBounds.weekEnd,
      });
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `רשימת-הזמנה-ספקים-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "הקובץ הורד בהצלחה", variant: "success" });
  }

  async function loadArchives() {
    setArchivesLoading(true);
    try {
      const res = await fetch("/api/admin/history", { cache: "no-store" });
      if (!res.ok) throw new Error("טעינת ארכיון נכשלה");
      const data = (await res.json()) as { archives: WeeklyArchive[] };
      setArchives(data.archives ?? ([] as WeeklyArchive[]));
      if (!selectedArchive && (data.archives ?? []).length > 0) {
        setSelectedArchive(data.archives[0]);
      }
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "שגיאה", variant: "error" });
    } finally {
      setArchivesLoading(false);
    }
  }

  async function deleteArchive(id: string) {
    if (!confirm("האם למחוק את הארכיון הזה לצמיתות?\n\nשים לב: מחיקה זו תסיר רק את שורת הארכיון, ותשאיר את כל ההזמנות המקוריות במסד הנתונים.")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/archives/${id}`, { method: "DELETE", cache: "no-store" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "מחיקת הארכיון נכשלה");
      }
      toast({ title: "הארכיון נמחק", variant: "success" });
      if (selectedArchive?.id === id) {
        setSelectedArchive(null);
      }
      await loadArchives();
      notifySync();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "שגיאה במחיקת ארכיון", variant: "error" });
    } finally {
      setLoading(false);
    }
  }

  async function handleArchiveReset() {
    if (!confirm("האם אתה בטוח שברצונך להעביר את נתוני השבוע החולף לארכיון ולאפס את המלאי וההזמנות?")) return;
    if (!confirm("פעולה זו תעביר את כל ההזמנות לארכיון ותאפס את מלאי הדוכן. האם להמשיך?")) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/weekly-reset", { method: "POST", cache: "no-store" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "שגיאה בארכון שבועי");
      }
      toast({ title: "הנתונים נשמרו בהצלחה בארכיון והמערכת אופסה לשבוע חדש", variant: "success" });
      await load();
      await loadArchives();
      notifySync();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "שגיאה בארכון שבועי", variant: "error" });
    } finally {
      setLoading(false);
    }
  }

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container flex items-center justify-between gap-2 py-3">
          <AdminNav />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="destructive"
              onClick={handleArchiveReset}
              disabled={loading}
              className="gap-1.5"
            >
              <Archive className="h-4 w-4" />
              העבר לארכיון ואפס שבוע
            </Button>
            <Button asChild size="sm" variant="outline" className="border-primary/20 hover:border-primary/40 hover:bg-primary/5">
              <a href="/" target="_blank" rel="noreferrer" className="flex items-center gap-1.5">
                <Package className="h-4 w-4" />
                חנות
              </a>
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { clearAdminAuth(); window.location.replace("/admin"); }} className="hover:bg-destructive/10 hover:text-destructive">
              <LogOut className="h-4 w-4" />
              יציאה
            </Button>
          </div>
        </div>
      </header>

      <div className="container py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">סיכום מלאי</h1>
            <p className="text-sm text-muted-foreground mt-1">ניהול מלאי ופיננסים — הזמנות מוקדמות, דוכן והזמנת ספקים</p>
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {loading && activeTab !== 'supplier' ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => load()}
                disabled={loading}
                className="border-primary/20 hover:border-primary/40 hover:bg-primary/5"
              >
                <RefreshCw className={`h-4 w-4 ml-1.5 ${loading ? 'animate-spin' : ''}`} />
                רענון
              </Button>
            </div>

            <section className="space-y-4">
              {/* Pre-orders summary */}
              <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                <div className="bg-primary/5 border-b px-5 py-3 flex items-center gap-2">
                  <Truck className="h-5 w-5 text-primary" />
                  <h2 className="text-base font-semibold text-foreground">הזמנות מראש</h2>
                </div>
                <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
                  <div className="bg-card p-4">
                    <p className="text-xs font-medium text-muted-foreground">עלות ספק</p>
                    <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{formatILS(preorderStats.cost)}</p>
                  </div>
                  <div className="bg-card p-4">
                    <p className="text-xs font-medium text-muted-foreground">הכנסות</p>
                    <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{formatILS(preorderStats.revenue)}</p>
                  </div>
                  <div className="bg-card p-4">
                    <p className="text-xs font-medium text-muted-foreground">רווח / הפסד</p>
                    <p className={`mt-1 text-xl font-bold tabular-nums ${preorderStats.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>{formatILS(preorderStats.profit)}</p>
                  </div>
                  <div className="bg-card p-4">
                    <p className="text-xs font-medium text-muted-foreground">אחוז נאסף/נשלח</p>
                    <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{preorderSellThrough.toFixed(1)}%</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">נאסף מתוך {preorderStats.units} יח׳</p>
                  </div>
                </div>
              </div>

              {/* Stall sales summary */}
              <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                <div className="bg-secondary/40 border-b px-5 py-3 flex items-center gap-2">
                  <Package className="h-5 w-5 text-primary" />
                  <h2 className="text-base font-semibold text-foreground">מכירה בדוכן</h2>
                </div>
                <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
                  <div className="bg-card p-4">
                    <p className="text-xs font-medium text-muted-foreground">עלות ספק</p>
                    <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{formatILS(stallCost)}</p>
                  </div>
                  <div className="bg-card p-4">
                    <p className="text-xs font-medium text-muted-foreground">הכנסות</p>
                    <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{formatILS(stallRevenue)}</p>
                  </div>
                  <div className="bg-card p-4">
                    <p className="text-xs font-medium text-muted-foreground">רווח / הפסד</p>
                    <p className={`mt-1 text-xl font-bold tabular-nums ${stallProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>{formatILS(stallProfit)}</p>
                  </div>
                  <div className="bg-card p-4">
                    <p className="text-xs font-medium text-muted-foreground">אחוז מכירה</p>
                    <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{stallSellThrough.toFixed(1)}%</p>
                  </div>
                </div>
              </div>

              {/* Combined total profit banner */}
              <div className="rounded-xl border bg-gradient-to-l from-gold/10 to-primary/5 p-5 shadow-sm">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gold/20">
                      <TrendingUp className="h-6 w-6 text-gold-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">רווח כולל (הזמנות מראש + מכירה בדוכן)</p>
                      <p className={`text-3xl font-bold tabular-nums ${totalProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>{formatILS(totalProfit)}</p>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground text-end">
                    <p>הזמנות מראש: <span className="font-medium text-foreground">{formatILS(preorderStats.profit)}</span></p>
                    <p>מכירה בדוכן: <span className="font-medium text-foreground">{formatILS(stallProfit)}</span></p>
                  </div>
                </div>
              </div>
            </section>

            <div className="flex items-center gap-2 p-1 bg-muted rounded-lg w-fit">
              <button
                onClick={() => setActiveTab('preOrders')}
                className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all ${
                  activeTab === 'preOrders'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Truck className="h-4 w-4" />
                הזמנות מוקדמות
              </button>
              <button
                onClick={() => setActiveTab('liveStock')}
                className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all ${
                  activeTab === 'liveStock'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Package className="h-4 w-4" />
                מלאי דוכן
              </button>
              <button
                onClick={() => setActiveTab('supplier')}
                className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all ${
                  activeTab === 'supplier'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <ClipboardList className="h-4 w-4" />
                הזמנת ספקים
              </button>
              <button
                onClick={() => setActiveTab('archives')}
                className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all ${
                  activeTab === 'archives'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Archive className="h-4 w-4" />
                ארכיון
              </button>
            </div>

            {activeTab === 'preOrders' && (
              <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                <div className="p-5 border-b">
                  <h2 className="text-lg font-semibold text-foreground">דיווח הזמנות מוקדמות</h2>
                  <p className="text-sm text-muted-foreground mt-1">צפייה בלבד — פירוט לפי מוצר עם פירוק לפי סוג איסוף, סטטוס ביצוע, ועמודות עלויות/הכנסות</p>
                </div>
                {preOrderData.length === 0 ? (
                  <div className="p-10 text-center">
                    <Truck className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                    <p className="text-muted-foreground">אין הזמנות מוקדמות מאושרות.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="p-3 text-right font-semibold">מוצר</th>
                          <th className="p-3 text-right font-semibold">יחידות בהזמנה</th>
                          <th className="p-3 text-right font-semibold">איסוף עצמי - סה״כ</th>
                          <th className="p-3 text-right font-semibold">משלוח - סה״כ</th>
                          <th className="p-3 text-right font-semibold">נאספו בפועל</th>
                          <th className="p-3 text-right font-semibold">ממתין לאיסוף</th>
                          <th className="p-3 text-right font-semibold">נשלחו בפועל</th>
                          <th className="p-3 text-right font-semibold">ממתין למשלוח</th>
                          <th className="p-3 text-right font-semibold">עלות ספק/יח׳</th>
                          <th className="p-3 text-right font-semibold">סה״כ עלות ספק</th>
                          <th className="p-3 text-right font-semibold">הכנסות</th>
                          <th className="p-3 text-right font-semibold">רווח</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {preOrderData.map((item) => (
                          <tr key={item.product_id} className="hover:bg-muted/30 transition-colors">
                            <td className="p-3 font-medium">{item.title}</td>
                            <td className="p-3 tabular-nums">{item.approved_orders}</td>
                            <td className="p-3 tabular-nums">{item.pickup_total}</td>
                            <td className="p-3 tabular-nums">{item.delivery_total}</td>
                            <td className="p-3 tabular-nums">{item.pickup_completed}</td>
                            <td className="p-3 tabular-nums">{item.pickup_pending}</td>
                            <td className="p-3 tabular-nums">{item.delivery_completed}</td>
                            <td className="p-3 tabular-nums">{item.delivery_pending}</td>
                            <td className="p-3 tabular-nums text-muted-foreground">{formatILS(item.cost_price)}</td>
                            <td className="p-3 tabular-nums font-medium text-foreground">{formatILS(item.approved_orders * item.cost_price)}</td>
                            <td className="p-3 tabular-nums font-medium text-foreground">{formatILS(item.revenue)}</td>
                            <td className="p-3 tabular-nums font-medium text-emerald-600 dark:text-emerald-400">{formatILS(item.profit)}</td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                          <td className="p-3">סה״כ</td>
                          <td className="p-3 tabular-nums">{preOrderTotals.units}</td>
                          <td className="p-3 tabular-nums">{preOrderTotals.pickup_total}</td>
                          <td className="p-3 tabular-nums">{preOrderTotals.delivery_total}</td>
                          <td className="p-3 tabular-nums">{preOrderTotals.pickup_completed}</td>
                          <td className="p-3 tabular-nums">{preOrderTotals.pickup_pending}</td>
                          <td className="p-3 tabular-nums">{preOrderTotals.delivery_completed}</td>
                          <td className="p-3 tabular-nums">{preOrderTotals.delivery_pending}</td>
                          <td className="p-3 tabular-nums text-muted-foreground">—</td>
                          <td className="p-3 tabular-nums font-medium text-foreground">{formatILS(preOrderTotals.cost)}</td>
                          <td className="p-3 tabular-nums font-medium text-foreground">{formatILS(preOrderTotals.revenue)}</td>
                          <td className="p-3 tabular-nums font-medium text-emerald-600 dark:text-emerald-400">{formatILS(preOrderTotals.profit)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'liveStock' && (
              <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                <div className="p-5 border-b">
                  <h2 className="text-lg font-semibold text-foreground">מלאי דוכן בשישי</h2>
                  <p className="text-sm text-muted-foreground mt-1">ניהול מלאי חיה — מעקב אחר מכירות וסטטיסטיקת sell-through</p>
                </div>
                {summary.length === 0 ? (
                  <div className="p-10 text-center">
                    <Package className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                    <p className="text-muted-foreground">אין מוצרים פעילים.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="p-4 text-right font-semibold">מוצר</th>
                          <th className="p-4 text-right font-semibold">מלאי ראשוני</th>
                          <th className="p-4 text-right font-semibold">מלאי נוכחי</th>
                          <th className="p-4 text-right font-semibold">יחידות נמכר</th>
                          <th className="p-4 text-right font-semibold">הכנסות דוכן</th>
                          <th className="p-4 text-right font-semibold">רווח דוכן</th>
                          <th className="p-4 text-right font-semibold">אחוז מכירה</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {summary.map((item) => {
                          const initialStock = Math.max(0, item.initial_stock_count);
                          const unitsSold = Math.max(0, initialStock - item.live_stock_count);
                          const sellThrough = initialStock > 0 ? (unitsSold / initialStock) * 100 : 0;
                          const revenue = unitsSold * item.price_standard;
                          const profit = unitsSold * Math.max(0, item.price_standard - item.cost_price);
                          return (
                            <tr key={item.product_id} className="hover:bg-muted/30 transition-colors">
                              <td className="p-4 font-medium">{item.title}</td>
                              <td className="p-4 tabular-nums text-muted-foreground">{initialStock}</td>
                              <td className="p-4 tabular-nums font-medium text-foreground">{item.live_stock_count}</td>
                              <td className="p-4 tabular-nums font-medium text-foreground">{unitsSold}</td>
                              <td className="p-4 tabular-nums font-medium text-foreground">{formatILS(revenue)}</td>
                              <td className="p-4 tabular-nums font-medium text-emerald-600 dark:text-emerald-400">{formatILS(profit)}</td>
                              <td className="p-4 tabular-nums">
                                <div className="flex items-center gap-2">
                                  <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden max-w-[80px]">
                                    <div
                                      className="h-full rounded-full bg-primary transition-all duration-500"
                                      style={{ width: `${Math.min(100, Math.max(0, sellThrough))}%` }}
                                    />
                                  </div>
                                  <span className={`text-xs font-medium tabular-nums ${
                                    sellThrough >= 80 ? 'text-emerald-600 dark:text-emerald-400' :
                                    sellThrough >= 50 ? 'text-orange-600 dark:text-orange-400' :
                                    'text-muted-foreground'
                                  }`}>
                                    {sellThrough.toFixed(0)}%
                                  </span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {summary.length === 0 && (
                          <tr>
                            <td colSpan={7} className="p-6 text-center text-muted-foreground">
                              אין מוצרים פעילים.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'supplier' && (
              <div className="space-y-4">
                <div className="rounded-xl border bg-card p-5 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-foreground">תכנון הזמנת ספקים</h2>
                      <p className="text-sm text-muted-foreground mt-1">
                        ההזמנה לספק משותפת — סך הזמנות מראש <strong>פלוס</strong> תוספת ידנית לדוכן.
                        הרווח/הפסד מחושבים בנפרד: הזמנות מראש מנוהלות בנפרד מהדוכן.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={confirmSupplierOrder}
                      disabled={!products.length}
                    >
                      אשר הזמנה
                    </Button>
                  </div>
                  {supplier.length === 0 ? (
                    <p className="text-sm text-muted-foreground">אין הזמנות פעילות השבוע.</p>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {supplier.map((s) => {
                        const adjustment = supplierAdjustments[s.product_id] ?? 0;
                        const total = Math.max(0, s.total_qty + adjustment);
                        return (
                          <div
                            key={s.product_id}
                            className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm"
                          >
                            <span className="font-medium">{s.title}</span>
                            <div className="flex items-center gap-1 text-xs">
                              <span className="text-muted-foreground">
                                {s.total_qty} הוזמנו   
                              </span>
                              <span className="text-muted-foreground">+</span>
                              <input
                                type="number"
                                min={0}
                                className="w-14 text-center border rounded px-1 py-0.5"
                                value={adjustment}
                                onChange={(e) => {
                                  const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                                  setSupplierAdjustments((prev) => {
                                    if (val === 0) {
                                      const next = { ...prev };
                                      delete next[s.product_id];
                                      return next;
                                    }
                                    return { ...prev, [s.product_id]: val };
                                  });
                                }}
                              />
                              <span className="text-muted-foreground">=</span>
                              <span className="font-semibold tabular-nums">
                                {total}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border bg-card p-5 shadow-sm space-y-3">
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="flex items-center gap-2 text-lg font-bold">
                      <MessageSquare className="h-5 w-5 text-primary" />
                      הודעה לספק
                    </h2>
                    <span className="text-xs text-muted-foreground">
                      הודעה מוכנה לשליחה לספק — שבוע קודש
                    </span>
                  </div>
                  <Textarea
                    value={supplierMessage}
                    readOnly
                    rows={10}
                    className="font-mono text-sm"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={copyMessage}>
                      <Copy className="h-4 w-4" />
                      העתק הודעה לספק
                    </Button>
                    <Button size="sm" variant="outline" onClick={downloadMessage}>
                      <Download className="h-4 w-4" />
                      הורד קובץ להודעה
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'archives' && (
              <div className="space-y-4">
                <div className="rounded-xl border bg-card p-5 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-foreground">היסטוריית שבועות</h2>
                      <p className="text-sm text-muted-foreground mt-1">צפייה בארכיוני שבועות קודמים עם סיכום הכנסות ורווח</p>
                    </div>
                    {archives.length > 0 && (
                      <select
                        value={selectedArchive?.id ?? ""}
                        onChange={(e) => {
                          const id = e.target.value;
                          const found = archives.find((a) => a.id === id) ?? null;
                          setSelectedArchive(found);
                        }}
                        className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="">— בחרו שבוע —</option>
                        {archives.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.week_label ?? `שבוע ${a.week_start}`}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {archivesLoading ? (
                    <div className="flex justify-center py-10">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  ) : archives.length === 0 ? (
                    <p className="text-center text-sm text-muted-foreground py-10">
                      אין שבועות בארכיון עדיין. השתמשו בכפתור "העבר לארכיון ואפס שבוע" כדי לשמור את נתוני השבוע.
                    </p>
                  ) : !selectedArchive ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                           <tr>
                             <th className="p-3 text-right font-semibold">שבוע</th>
                             <th className="p-3 text-right font-semibold">תאריכים</th>
                             <th className="p-3 text-right font-semibold">הזמנות</th>
                             <th className="p-3 text-right font-semibold">הכנסות</th>
                             <th className="p-3 text-right font-semibold">רווח גולמי</th>
                             <th className="p-3 text-right font-semibold">הזמנות מוקדמות</th>
                             <th className="p-3 text-right font-semibold">מכירות דוכן</th>
                             <th className="p-3 text-center font-semibold">פעולות</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {archives.map((a: WeeklyArchive) => (
                            <tr
                              key={a.id}
                              className="hover:bg-muted/30 transition-colors"
                            >
                              <td
                                className="p-3 font-medium cursor-pointer"
                                onClick={() => setSelectedArchive(a)}
                              >
                                {a.week_label ?? `שבוע ${a.week_start}`}
                              </td>
                              <td
                                className="p-3 tabular-nums text-muted-foreground cursor-pointer"
                                onClick={() => setSelectedArchive(a)}
                              >
                                {new Date(a.week_start).toLocaleDateString("he-IL")} – {new Date(a.week_end).toLocaleDateString("he-IL")}
                              </td>
                              <td
                                className="p-3 tabular-nums cursor-pointer"
                                onClick={() => setSelectedArchive(a)}
                              >
                                {a.orders_count}
                              </td>
                              <td
                                className="p-3 tabular-nums font-medium cursor-pointer"
                                onClick={() => setSelectedArchive(a)}
                              >
                                {formatILS(a.total_revenue)}
                              </td>
                              <td
                                className={`p-3 tabular-nums font-medium cursor-pointer ${a.gross_profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}
                                onClick={() => setSelectedArchive(a)}
                              >
                                {formatILS(a.gross_profit)}
                              </td>
                              <td
                                className="p-3 tabular-nums cursor-pointer"
                                onClick={() => setSelectedArchive(a)}
                              >
                                <span className="text-muted-foreground">{a.preorders_count} הזמנות</span>
                                <span className="text-xs block text-muted-foreground/70">{formatILS(a.preorders_revenue)} · רווח {formatILS(a.preorders_profit)}</span>
                              </td>
                              <td
                                className="p-3 tabular-nums cursor-pointer"
                                onClick={() => setSelectedArchive(a)}
                              >
                                <span className="text-muted-foreground">{a.stall_sales_count} מכירות</span>
                                <span className="text-xs block text-muted-foreground/70">{formatILS(a.stall_revenue)} · רווח {formatILS(a.stall_profit)}</span>
                              </td>
                              <td className="p-3 text-center">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void deleteArchive(a.id);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-foreground">פרטי ארכיון</h2>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="gap-1.5"
                          onClick={() => deleteArchive(selectedArchive.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                          מחק ארכיון
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <ArchiveSummaryCard
                          title="סה״כ הכנסות"
                          value={formatILS(selectedArchive.total_revenue)}
                          subtitle={`מוצרים ${formatILS(selectedArchive.products_revenue)} · משלוחים ${formatILS(selectedArchive.delivery_revenue)}`}
                        />
                        <ArchiveSummaryCard
                          title="הזמנות"
                          value={String(selectedArchive.orders_count)}
                          subtitle={`${selectedArchive.pickup_count} איסוף · ${selectedArchive.delivery_count} משלוח`}
                        />
                        <ArchiveSummaryCard
                          title="רווח גולמי"
                          value={formatILS(selectedArchive.gross_profit)}
                          subtitle={`עלות ספקים ${formatILS(selectedArchive.total_cost)} · עלות ספקים ${formatILS(selectedArchive.total_supplier_cost)}`}
                        />
                        <ArchiveSummaryCard
                          title="תאריכים"
                          value={`${new Date(selectedArchive.week_start).toLocaleDateString("he-IL")} – ${new Date(selectedArchive.week_end).toLocaleDateString("he-IL")}`}
                          subtitle={selectedArchive.week_label ?? ""}
                        />
                      </div>

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <div className="rounded-xl border bg-muted/30 p-4">
                          <h3 className="text-sm font-semibold mb-2">הזמנות מוקדמות</h3>
                          <p className="text-xs text-muted-foreground mb-1">{selectedArchive.preorders_count} הזמנות</p>
                          <p className="text-sm font-medium">הכנסה: {formatILS(selectedArchive.preorders_revenue)}</p>
                          <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">רווח: {formatILS(selectedArchive.preorders_profit)}</p>
                        </div>
                        <div className="rounded-xl border bg-muted/30 p-4">
                          <h3 className="text-sm font-semibold mb-2">מכירות דוכן</h3>
                          <p className="text-xs text-muted-foreground mb-1">{selectedArchive.stall_sales_count} מכירות</p>
                          <p className="text-sm font-medium">הכנסה: {formatILS(selectedArchive.stall_revenue)}</p>
                          <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">רווח: {formatILS(selectedArchive.stall_profit)}</p>
                        </div>
                        <div className="rounded-xl border bg-muted/30 p-4">
                          <h3 className="text-sm font-semibold mb-2">סה״כ רווח נטו</h3>
                          <p className="text-xs text-muted-foreground mb-1">עלות ספקים: {formatILS(selectedArchive.total_supplier_cost)}</p>
                          <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">רווח נטו: {formatILS(selectedArchive.total_net_profit)}</p>
                        </div>
                      </div>

                      {(selectedArchive.top_products ?? []).length > 0 && (
                        <div className="rounded-xl border bg-card p-4 shadow-sm">
                          <h2 className="mb-3 text-lg font-bold">זרים מובילים בשבוע</h2>
                          <div className="overflow-x-auto rounded-lg border">
                            <table className="w-full text-sm">
                              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                                <tr>
                                  <th className="p-2 text-start">#</th>
                                  <th className="p-2 text-start">זר</th>
                                  <th className="p-2 text-start">יחידות</th>
                                  <th className="p-2 text-start">הכנסה</th>
                                  <th className="p-2 text-start">עלות</th>
                                  <th className="p-2 text-start">רווח</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(selectedArchive.top_products as any[]).map((p, i) => (
                                  <tr key={p.product_id ?? i} className="border-t">
                                    <td className="p-2">{i + 1}</td>
                                    <td className="p-2">{p.title}</td>
                                    <td className="p-2 tabular-nums">{p.units}</td>
                                    <td className="p-2 tabular-nums font-medium">{formatILS(p.revenue)}</td>
                                    <td className="p-2 tabular-nums text-muted-foreground">{formatILS(p.cost)}</td>
                                    <td className="p-2 tabular-nums font-medium text-emerald-600 dark:text-emerald-400">{formatILS(p.profit)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {(() => {
                        const snap = (selectedArchive as any).snapshot_data ?? {};
                        const stallInv = snap?.stall_inventory;
                        const stallProducts: Array<{
                          product_id: string;
                          title: string;
                          initial_stock_count: number;
                          live_stock_count: number;
                          units_sold: number;
                          sell_through_percent: number;
                          revenue: number;
                          supplier_cost: number;
                          profit: number;
                        }> = Array.isArray(stallInv?.products) ? stallInv.products : [];
                        const totals = stallInv?.totals;
                        const overall = stallInv?.sell_through_percent;
                        if (stallProducts.length === 0) return null;
                        return (
                          <div className="rounded-xl border bg-card p-4 shadow-sm">
                            <h2 className="mb-3 text-lg font-bold">מלאי דוכן בשבוע</h2>
                            {totals && (
                              <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4 text-xs">
                                <div className="rounded-md bg-muted/40 p-2">
                                  <p className="text-muted-foreground">מלאי ראשוני</p>
                                  <p className="font-semibold tabular-nums">{totals.initial_stock_count}</p>
                                </div>
                                <div className="rounded-md bg-muted/40 p-2">
                                  <p className="text-muted-foreground">מלאי סופי</p>
                                  <p className="font-semibold tabular-nums">{totals.live_stock_count}</p>
                                </div>
                                <div className="rounded-md bg-muted/40 p-2">
                                  <p className="text-muted-foreground">יחידות שנמכרו</p>
                                  <p className="font-semibold tabular-nums">{totals.units_sold}</p>
                                </div>
                                <div className="rounded-md bg-muted/40 p-2">
                                  <p className="text-muted-foreground">אחוז מכירה</p>
                                  <p className="font-semibold tabular-nums">{overall}%</p>
                                </div>
                              </div>
                            )}
                            <div className="overflow-x-auto rounded-lg border">
                              <table className="w-full text-sm">
                                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                                  <tr>
                                    <th className="p-2 text-start">מוצר</th>
                                    <th className="p-2 text-start">מלאי ראשוני</th>
                                    <th className="p-2 text-start">מלאי סופי</th>
                                    <th className="p-2 text-start">נמכר</th>
                                    <th className="p-2 text-start">הכנסה</th>
                                    <th className="p-2 text-start">עלות ספק</th>
                                    <th className="p-2 text-start">רווח</th>
                                    <th className="p-2 text-start">% מכירה</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {stallProducts.map((p, idx) => (
                                    <tr key={p.product_id ?? idx} className="border-t">
                                      <td className="p-2">{p.title}</td>
                                      <td className="p-2 tabular-nums">{p.initial_stock_count}</td>
                                      <td className="p-2 tabular-nums">{p.live_stock_count}</td>
                                      <td className="p-2 tabular-nums font-medium">{p.units_sold}</td>
                                      <td className="p-2 tabular-nums">{formatILS(p.revenue)}</td>
                                      <td className="p-2 tabular-nums text-muted-foreground">{formatILS(p.supplier_cost)}</td>
                                      <td className="p-2 tabular-nums font-medium text-emerald-600 dark:text-emerald-400">{formatILS(p.profit)}</td>
                                      <td className="p-2 tabular-nums">{p.sell_through_percent}%</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function ArchiveSummaryCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="mb-1 text-xs font-medium text-muted-foreground">
        {title}
      </div>
      <div className="brand-serif text-xl font-bold text-primary">{value}</div>
      {subtitle && (
        <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}
