"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ExternalLink,
  Loader2,
  LogOut,
  Save,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  clearAdminAuth,
  isAdminAuthenticated,
} from "@/components/AdminGate";
import { MEMBER_DISCOUNT_PERCENT } from "@/lib/constants";
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

export default function AdminOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const orderId = params?.id ?? "";
  const [ready, setReady] = useState(false);
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!isAdminAuthenticated()) {
      window.location.replace("/admin");
      return;
    }
    setReady(true);
    if (orderId) {
      void load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("הזמנה לא נמצאה");
      const data = (await res.json()) as { order: Order };
      setOrder(data.order);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!order) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: order.status,
          customer_name: order.customer_name,
          customer_phone: order.customer_phone,
          delivery_address: order.delivery_address,
          notes: order.notes,
          fulfillment_type: order.fulfillment_type,
          payment_method: order.payment_method,
          greeting_note: order.greeting_note,
        }),
      });
      if (!res.ok) throw new Error("שמירה נכשלה");
      const data = (await res.json()) as { order: Order };
      setOrder(data.order);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setSaving(false);
    }
  }

  async function del() {
    if (
      !confirm(
        `למחוק את ההזמנה של ${order?.customer_name}? לא ניתן לשחזר.`,
      )
    ) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("מחיקה נכשלה");
      router.push("/admin/orders");
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setDeleting(false);
    }
  }

  function logout() {
    clearAdminAuth();
    window.location.replace("/admin");
  }

  const items = order ? Array.isArray(order.items) ? order.items : [] : [];

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
        <div className="container flex items-center justify-between gap-2 py-3">
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

      <div className="container max-w-3xl space-y-4 py-4">
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {loading || !order ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-bold">
                הזמנה #{order.id.slice(0, 8)}
              </h1>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={del}
                  disabled={deleting}
                >
                  {deleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  מחק הזמנה
                </Button>
                <Button
                  size="sm"
                  onClick={save}
                  disabled={saving}
                  className="rounded-full"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  שמור
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 rounded-xl border bg-card p-4 shadow-sm md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="customer_name">שם לקוח</Label>
                <Input
                  id="customer_name"
                  value={order.customer_name}
                  onChange={(e) =>
                    setOrder({ ...order, customer_name: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer_phone">טלפון</Label>
                <Input
                  id="customer_phone"
                  value={order.customer_phone}
                  onChange={(e) =>
                    setOrder({ ...order, customer_phone: e.target.value })
                  }
                  dir="ltr"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="delivery_address">כתובת למשלוח</Label>
                <Input
                  id="delivery_address"
                  value={order.delivery_address ?? ""}
                  onChange={(e) =>
                    setOrder({
                      ...order,
                      delivery_address: e.target.value || null,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">סטטוס</Label>
                <select
                  id="status"
                  value={order.status}
                  onChange={(e) =>
                    setOrder({
                      ...order,
                      status: e.target.value as Order["status"],
                    })
                  }
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="total_amount">סה״כ</Label>
                <Input
                  id="total_amount"
                  value={formatILS(order.total_amount)}
                  readOnly
                  className="bg-muted"
                />
              </div>
              <div className="flex items-center justify-between rounded-md border border-primary/10 bg-cream/40 p-3">
                <span className="text-xs">
                  {order.is_member
                    ? `הנחת לקוח קבוע הוחלה (${MEMBER_DISCOUNT_PERCENT}%)`
                    : "ללא הנחת לקוח קבוע"}
                </span>
                {order.is_member && (
                  <span className="text-xs font-medium text-gold-foreground">
                    לקוח קבוע
                  </span>
                )}
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="notes">הערות</Label>
                <Textarea
                  id="notes"
                  value={order.notes ?? ""}
                  onChange={(e) =>
                    setOrder({ ...order, notes: e.target.value || null })
                  }
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fulfillment_type">סוג אספקה</Label>
                <select
                  id="fulfillment_type"
                  value={order.fulfillment_type ?? "pickup"}
                  onChange={(e) =>
                    setOrder({
                      ...order,
                      fulfillment_type: e.target.value as "delivery" | "pickup",
                    })
                  }
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="delivery">משלוח</option>
                  <option value="pickup">איסוף עצמי</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="payment_method">אמצעי תשלום</Label>
                <select
                  id="payment_method"
                  value={order.payment_method ?? ""}
                  onChange={(e) =>
                    setOrder({
                      ...order,
                      payment_method: e.target.value ? (e.target.value as "bit" | "paybox" | "cash") : undefined,
                    })
                  }
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">--</option>
                  <option value="bit">ביט</option>
                  <option value="paybox">PayBox</option>
                  <option value="cash">מזומן</option>
                </select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="greeting_note">מכתב / ברכה לזר</Label>
                <Textarea
                  id="greeting_note"
                  value={order.greeting_note ?? ""}
                  onChange={(e) =>
                    setOrder({ ...order, greeting_note: e.target.value || null })
                  }
                  rows={2}
                />
              </div>
            </div>

            <section className="rounded-xl border bg-card p-4 shadow-sm">
              <h2 className="mb-2 font-semibold">פריטים בהזמנה</h2>
              <div className="space-y-2">
                {items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    אין פריטים בהזמנה.
                  </p>
                ) : (
                  items.map((it, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-md border p-2 text-sm"
                    >
                      <span>{it.title} ×{it.qty}</span>
                      <span className="tabular-nums">
                        {formatILS(it.price * it.qty)}
                      </span>
                    </div>
                  ))
                )}
                <div className="flex justify-between border-t pt-2 font-bold">
                  <span>סה״כ</span>
                  <span className="tabular-nums">
                    {formatILS(order.total_amount)}
                  </span>
                </div>
              </div>
            </section>

            <div className="flex justify-end gap-2">
              <Button asChild variant="ghost" size="sm">
                <Link href="/admin/orders">
                  חזרה להזמנות
                </Link>
              </Button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
