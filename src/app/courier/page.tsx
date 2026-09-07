"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Phone, MapPin, Package, LogOut, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildWhatsAppLink, normalizeWhatsAppRecipient } from "@/lib/utils";
import type { Order } from "@/types";
import PinAuthGate from "@/components/PinAuthGate";

export default function CourierPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/courier/orders");
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders ?? []);
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

  async function markSent(orderId: string) {
    setUpdating(orderId);
    try {
      const res = await fetch(`/api/courier/orders/${orderId}`, {
        method: "PATCH",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "שגיאה בעדכון הסטטוס");
      }
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "שגיאה בעדכון הסטטוס");
    } finally {
      setUpdating(null);
    }
  }

  function handleLogout() {
    document.cookie =
      "flowers_courier_auth=; Path=/; Max-Age=0; SameSite=Lax";
    router.replace("/courier");
  }

  return (
    <PinAuthGate pinRole="COURIER">
      <main className="min-h-screen bg-muted/30 p-4" dir="rtl">
        <div className="mx-auto max-w-2xl space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">הזמנות למשלוח</h1>
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
                className="gap-2"
              >
                <LogOut className="h-4 w-4" />
                יציאה
              </Button>
            </div>
          </div>

          {loading ? (
            <p className="text-center text-muted-foreground">טוען...</p>
          ) : orders.length === 0 ? (
            <p className="text-center text-muted-foreground">אין הזמנות משלוח כרגע</p>
          ) : (
            <div className="grid gap-4">
              {orders.map((order) => (
                <div
                  key={order.id}
                  className="rounded-lg border bg-card p-4 shadow-sm"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h2 className="text-lg font-semibold">
                          {order.customer_name}
                        </h2>
                        <div className="mt-1 flex flex-wrap gap-2">
                          <a
                            href={`tel:${order.customer_phone}`}
                            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                          >
                            <Phone className="h-4 w-4" />
                            {order.customer_phone}
                          </a>
                          {normalizeWhatsAppRecipient(order.customer_phone) && (
                            <a
                              href={buildWhatsAppLink(
                                order.customer_phone,
                                "",
                              )}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-sm text-green-700 hover:underline"
                            >
                              WhatsApp
                            </a>
                          )}
                        </div>
                      </div>
                    </div>

                    {order.delivery_address && (
                      <div className="flex items-start gap-2 text-sm text-muted-foreground">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{order.delivery_address}</span>
                      </div>
                    )}

                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Package className="h-4 w-4" />
                        <span>פריטים:</span>
                      </div>
                      <ul className="mr-6 list-disc space-y-1 text-sm text-muted-foreground">
                        {order.items.map((item, idx) => (
                          <li key={idx}>
                            {item.title} x{item.qty}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {order.greeting_note && (
                      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        <span className="font-medium">הערת ברכה: </span>
                        {order.greeting_note}
                      </div>
                    )}

                    <Button
                      className="w-full"
                      onClick={() => markSent(order.id)}
                      disabled={updating === order.id}
                    >
                      {updating === order.id ? "מעדכן..." : "סמן נשלח"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </PinAuthGate>
  );
}
