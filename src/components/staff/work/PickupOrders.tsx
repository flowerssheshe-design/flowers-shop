"use client";

import { useState } from "react";
import { PackageCheck, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { formatILS } from "@/lib/utils";
import { api, formatDateTime } from "@/lib/staff/work/client";
import { paymentStatus } from "@/lib/staff/work/courier";
import { telLink } from "@/lib/staff/work/links";
import { T } from "@/lib/staff/labels";
import { W } from "@/lib/staff/work/labels";
import { Card, EmptyBlock } from "./common";
import type { PickupOrder } from "./stall-types";

/** This week's approved pickup orders, handed over at the stall. */
export function PickupOrders({ orders, onChanged }: { orders: PickupOrder[]; onChanged: () => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function handOver(o: PickupOrder) {
    if (!window.confirm(`${W.handOverConfirm}\n${o.customer_name}`)) return;
    setBusy(o.id);
    try {
      await api(`/api/staff/stall/pickup/${o.id}`, { method: "POST" });
      toast({ title: W.handOverDone, variant: "success" });
      onChanged();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : T.saveError, variant: "error" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card title={`${W.pickupOrders} (${orders.length})`} description={W.pickupOrdersDesc}>
      {orders.length === 0 ? (
        <EmptyBlock text={W.noPickupOrders} />
      ) : (
        <ul className="space-y-3">
          {orders.map((o) => {
            const pay = paymentStatus(o);
            return (
              <li key={o.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{o.customer_name}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(o.created_at)}</p>
                  </div>
                  {o.customer_phone && (
                    <a
                      href={telLink(o.customer_phone)}
                      className="inline-flex h-10 items-center gap-1 rounded-md border px-3 text-sm"
                      dir="ltr"
                    >
                      <Phone className="h-4 w-4" aria-hidden="true" />
                      {o.customer_phone}
                    </a>
                  )}
                </div>
                <ul className="mt-2 space-y-0.5 text-sm">
                  {(o.items ?? []).map((it, i) => (
                    <li key={i}>
                      {it.title} × {it.qty}
                    </li>
                  ))}
                </ul>
                {o.greeting_note && <p className="mt-1 text-sm text-muted-foreground">{W.greeting}: {o.greeting_note}</p>}
                {o.notes && <p className="mt-1 text-sm text-muted-foreground">{W.notes}: {o.notes}</p>}
                <p className="mt-2 text-sm">
                  {pay.kind === "collect" ? (
                    <strong className="text-amber-700">
                      {W.collectCash}: {formatILS(pay.amount)}
                    </strong>
                  ) : pay.kind === "paid" ? (
                    <span className="text-primary">
                      {W.paidVia}
                      {T[pay.method as "bit" | "paybox"] ?? pay.method} · {formatILS(o.total_amount)}
                    </span>
                  ) : (
                    <span>{formatILS(o.total_amount)}</span>
                  )}
                </p>
                <Button className="mt-3 h-12 w-full text-base" onClick={() => void handOver(o)} disabled={busy === o.id}>
                  <PackageCheck className="h-5 w-5" aria-hidden="true" />
                  {busy === o.id ? "מעדכן…" : W.handedOver}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
