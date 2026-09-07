"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Download,
  ExternalLink,
  History,
  Loader2,
  LogOut,
  Package,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toaster";
import {
  clearAdminAuth,
  isAdminAuthenticated,
} from "@/components/AdminGate";
import { AdminNav } from "@/components/AdminNav";
import { formatILS } from "@/lib/utils";
import type { Order } from "@/types";

const STATUS_OPTIONS: Array<{
  value: Order["status"];
  label: string;
}> = [
  { value: "pending_payment", label: "ממתין לאישור תשלום" },
  { value: "approved", label: "מחכה לשליחה / איסוף" },
  { value: "completed", label: "הושלם (נאסף / נשלח)" },
  { value: "cancelled", label: "בוטל" },
  { value: "archived", label: "בארכיון" },
];

const STATUS_COLOR: Record<Order["status"], string> = {
  pending_payment: "bg-amber-100 text-amber-800 border-amber-200",
  approved: "bg-blue-100 text-blue-800 border-blue-200",
  completed: "bg-emerald-100 text-emerald-800 border-emerald-200",
  cancelled: "bg-rose-100 text-rose-800 border-rose-200",
  archived: "bg-slate-100 text-slate-700 border-slate-200",
};

export default function AdminOrdersPage() {
  const [ready, setReady] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [filtered, setFiltered] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!isAdminAuthenticated()) {
      window.location.replace("/admin");
      return;
    }
    setReady(true);
    void load(includeArchived);
  }, [includeArchived]);

  useEffect(() => {
    let items = orders;
    if (statusFilter !== "all") {
      items = items.filter((o) => o.status === statusFilter);
    }
    if (search.trim()) {
      const term = search.trim().toLowerCase();
      items = items.filter(
        (o) =>
          o.customer_name.toLowerCase().includes(term) ||
          o.customer_phone.includes(term),
      );
    }
    setFiltered(items);
  }, [orders, statusFilter, search]);

  async function load(withArchived: boolean) {
    setLoading(true);
    setError(null);
    try {
      const url = withArchived
        ? "/api/admin/orders?includeArchived=1"
        : "/api/admin/orders";
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("טעינת הזמנות נכשלה");
      const data = (await res.json()) as { orders: Order[] };
      setOrders(data.orders ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(order: Order, status: Order["status"]) {
    setUpdating(order.id);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("עדכון נכשל");
      const data = (await res.json()) as { order: Order };
      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? data.order : o)),
      );
    } catch {
      setError("עדכון ההזמנה נכשל");
    } finally {
      setUpdating(null);
    }
  }

  async function downloadDeliveryList() {
    setDownloading(true);
    try {
      const res = await fetch("/api/admin/delivery-list", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("ייצוא רשימת משלוחים נכשל");
      const data = (await res.json()) as { csv: string; count: number };
      const blob = new Blob([data.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `רשימת-משלוחים-${date}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({
        title: `יוצא ${data.count} הזמנות למשלוח`,
        variant: "success",
      });
    } catch (e) {
      toast({
        title: "ייצוא נכשל",
        description: e instanceof Error ? e.message : "שגיאה",
        variant: "error",
      });
    } finally {
      setDownloading(false);
    }
  }

  function logout() {
    clearAdminAuth();
    window.location.replace("/admin");
  }

  async function deleteOrder(order: Order) {
    if (
      !confirm(`למחוק את ההזמנה של ${order.customer_name}? לא ניתן לשחזר.`)
    ) {
      return;
    }
    setUpdating(order.id);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("מחיקה נכשלה");
      setOrders((prev) => prev.filter((o) => o.id !== order.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setUpdating(null);
    }
  }

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-muted/30 pb-12">
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <div className="container flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
          <AdminNav />
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/" target="_blank">
                <ExternalLink className="h-4 w-4" />
                חנות
              </Link>
            </Button>
            <Button size="sm" variant="ghost" onClick={logout}>
              <LogOut className="h-4 w-4" />
              יציאה
            </Button>
          </div>
        </div>
      </header>

      <div className="container space-y-4 py-4">
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl font-bold">הזמנות</h1>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-56">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="חיפוש לפי שם/טלפון..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 text-sm"
              />
            </div>
            ﻿            <div className="flex gap-2 overflow-x-auto pb-1">
              <button
                onClick={() => setStatusFilter("all")}
                className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium border ${statusFilter === "all"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-primary/15 hover:bg-accent"
                }`}
              >
                הכל
              </button>
              <button
                onClick={() => setStatusFilter("pending_payment")}
                className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium border ${statusFilter === "pending_payment"
                  ? "bg-amber-100 text-amber-800 border-amber-200"
                  : "bg-card border-primary/15 hover:bg-accent"
                }`}
              >
                ממתין לאישור תשלום
              </button>
              <button
                onClick={() => setStatusFilter("approved")}
                className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium border ${statusFilter === "approved"
                  ? "bg-blue-100 text-blue-800 border-blue-200"
                  : "bg-card border-primary/15 hover:bg-accent"
                }`}
              >
                מחכה לשליחה / איסוף
              </button>
              <button
                onClick={() => setStatusFilter("completed")}
                className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium border ${statusFilter === "completed"
                  ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                  : "bg-card border-primary/15 hover:bg-accent"
                }`}
              >
                הושלם
              </button>
              {includeArchived && (
                <button
                  onClick={() => setStatusFilter("archived")}
                  className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium border ${statusFilter === "archived"
                    ? "bg-slate-100 text-slate-700 border-slate-200"
                    : "bg-card border-primary/15 hover:bg-accent"
                  }`}
                >
                  ארכיון
                </button>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => load(includeArchived)}
              disabled={loading}
              className="border-primary/20 hover:border-primary/40 hover:bg-primary/5"
            >
              <RefreshCw className={`h-4 w-4 ml-1.5 ${loading ? "animate-spin" : ""}`} />
              רענון
            </Button>
            <Button
              size="sm"
              variant={includeArchived ? "default" : "outline"}
              onClick={() => setIncludeArchived((v) => !v)}
              title={includeArchived ? "הסתר הזמנות מארכיון" : "הצג גם הזמנות מארכיון"}
            >
              <History className="h-4 w-4" />
              {includeArchived ? "כולל ארכיון" : "כולל ארכיון"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={downloadDeliveryList}
              disabled={downloading}
            >
              {downloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              הורד רשימת משלוחים
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-10">
            אין הזמנות בפילטר זה.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
            <table className="w-full min-w-[700px] text-sm">
               <thead className="bg-muted/50 text-start text-xs uppercase text-muted-foreground">
                 <tr>
                   <th className="p-3 text-start">תאריך</th>
                   <th className="p-3 text-start">לקוח</th>
                   <th className="p-3 text-start">סוג לקוח</th>
                   <th className="p-3 text-start">פריטים</th>
                   <th className="p-3 text-start">סוג משלוח</th>
                   <th className="p-3 text-start">סה״כ</th>
                   <th className="p-3 text-start">סטטוס</th>
                   <th className="p-3 text-start">פעולות</th>
                 </tr>
               </thead>
              <tbody>
                {filtered.map((o) => {
                  const items = Array.isArray(o.items) ? o.items : [];
                  const itemCount = items.reduce(
                    (sum, it) => sum + (it.qty ?? 0),
                    0,
                  );
                  return (
                    <tr key={o.id} className="border-t align-top">
                      <td className="p-3 whitespace-nowrap tabular-nums">
                        {new Date(o.created_at).toLocaleString("he-IL")}
                      </td>
                       <td className="p-3">
                         <div className="font-medium">{o.customer_name}</div>
                         <div className="text-xs text-muted-foreground">{o.customer_phone}</div>
                       </td>
                       <td className="p-3">
                         {o.user_id ? (
                           o.is_member ? (
                             <span className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-2 py-1 text-xs font-medium text-gold-foreground">
                               לקוח קבוע
                             </span>
                           ) : (
                             <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2 py-1 text-xs font-medium">
                               לקוח מחובר
                             </span>
                           )
                         ) : (
                           <span className="inline-flex items-center gap-1 rounded-full border border-primary/10 bg-muted/40 px-2 py-1 text-xs font-medium text-muted-foreground">
                             לקוח בלי חשבון
                           </span>
                         )}
                       </td>
                       <td className="p-3">
                         <ul className="space-y-0.5 text-xs">
                           {items.slice(0, 3).map((it, idx) => (
                             <li key={idx}>
                               {it.title} ×{it.qty}
                             </li>
                           ))}
                           {items.length > 3 && (
                             <li className="text-muted-foreground">
                               +{items.length - 3} נוספים
                             </li>
                           )}
                         </ul>
                         <div className="mt-1 text-xs text-muted-foreground">
                           {itemCount} יח׳
                         </div>
                       </td>
                       <td className="p-3">
                         {o.delivery_type === "delivery"
                           ? "משלוח"
                           : "איסוף עצמי"}
                       </td>
                       <td className="p-3 font-semibold tabular-nums">
                         {formatILS(o.total_amount)}
                       </td>
                       <td className="p-3">
                         <span className={`inline-block rounded-md border px-2 py-1 text-xs font-medium ${STATUS_COLOR[o.status]}`}>
                           {STATUS_OPTIONS.find((s) => s.value === o.status)?.label ?? o.status}
                         </span>
                       </td>
                       <td className="p-3">
                         <div className="flex items-center gap-1">
                           {o.status === "pending_payment" && (
                             <Button
                               size="sm"
                               onClick={() => updateStatus(o, "approved")}
                               disabled={updating === o.id}
                               className="rounded-full"
                             >
                               אשר תשלום
                             </Button>
                           )}
                           <Button
                             asChild
                             variant="ghost"
                             size="sm"
                             aria-label={`הצג הזמנה ${o.id}`}
                             title="הצג הזמנה"
                           >
                             <Link href={`/admin/orders/${o.id}`}>
                               <Package className="h-3.5 w-3.5" />
                             </Link>
                           </Button>
<Button
                              variant="ghost"
                              size="sm"
                              aria-label={`מחק הזמנה ${o.id}`}
                              title="מחק הזמנה"
                              onClick={() => deleteOrder(o)}
                              disabled={updating === o.id}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                         </div>
                       </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="text-center text-xs text-muted-foreground">
          {filtered.length} הזמנות (מתוך {orders.length} סה״ם)
        </div>
      </div>
    </main>
  );
}
