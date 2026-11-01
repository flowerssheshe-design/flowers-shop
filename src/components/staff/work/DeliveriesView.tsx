"use client";

import { useState } from "react";
import { Bike, CheckCircle2, MapPin, MessageCircle, Navigation, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { cn, formatILS } from "@/lib/utils";
import { T } from "@/lib/staff/labels";
import { W } from "@/lib/staff/work/labels";
import { api, formatDateTime, useStaffData } from "@/lib/staff/work/client";
import { paymentStatus } from "@/lib/staff/work/courier";
import { googleMapsLink, telLink, wazeLink, whatsappLink } from "@/lib/staff/work/links";
import { Card, EmptyBlock, ErrorBlock, LoadingBlock, NoticeBlock, RefreshButton, Stat } from "./common";

type DeliveryOrder = {
  id: string;
  created_at: string;
  customer_name: string;
  customer_phone: string;
  delivery_address: string | null;
  items: { title: string; qty: number }[];
  total_amount: number;
  payment_method: string | null;
  notes: string | null;
  greeting_note: string | null;
  delivered_at: string | null;
  from_earlier_week?: boolean;
};

type DeliveriesData = {
  allowed: boolean;
  week: { start: string; end: string };
  courier: { id: string | null; name: string | null };
  pending?: DeliveryOrder[];
  delivered?: DeliveryOrder[];
};

const POLL_MS = 60_000;

function PaymentLine({ o }: { o: DeliveryOrder }) {
  const pay = paymentStatus(o);
  if (pay.kind === "collect") {
    return (
      <p className="rounded-md bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-900">
        {W.collectCash}: {formatILS(pay.amount)}
      </p>
    );
  }
  if (pay.kind === "paid") {
    return (
      <p className="rounded-md bg-primary/10 px-3 py-2 text-sm text-primary">
        {W.paidVia}
        {T[pay.method as "bit" | "paybox"] ?? pay.method} · {formatILS(o.total_amount)}
      </p>
    );
  }
  return <p className="text-sm">{W.payment}: {formatILS(o.total_amount)}</p>;
}

function DeliveryCard({
  o,
  busy,
  onDeliver,
}: {
  o: DeliveryOrder;
  busy: boolean;
  onDeliver: () => void;
}) {
  const wa = whatsappLink(o.customer_phone, `שלום ${o.customer_name}, כאן השליח של ״לתת מהלב״ 🌷`);
  return (
    <li className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-lg font-semibold">{o.customer_name}</p>
          <p className="text-xs text-muted-foreground" dir="ltr">
            {o.customer_phone}
          </p>
        </div>
        {o.from_earlier_week && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">{W.olderWeek}</span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <a
          href={telLink(o.customer_phone)}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-md border text-sm font-medium"
        >
          <Phone className="h-5 w-5" aria-hidden="true" />
          {W.call}
        </a>
        {wa ? (
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-whatsapp text-sm font-medium text-white"
          >
            <MessageCircle className="h-5 w-5" aria-hidden="true" />
            {W.whatsapp}
          </a>
        ) : (
          <span />
        )}
      </div>

      {o.delivery_address && (
        <div className="mt-3 space-y-2">
          <p className="flex items-start gap-2 text-sm">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{o.delivery_address}</span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            <a
              href={wazeLink(o.delivery_address)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-md border text-sm font-medium"
            >
              <Navigation className="h-5 w-5" aria-hidden="true" />
              {W.waze}
            </a>
            <a
              href={googleMapsLink(o.delivery_address)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-md border text-sm font-medium"
            >
              <MapPin className="h-5 w-5" aria-hidden="true" />
              {W.maps}
            </a>
          </div>
        </div>
      )}

      <div className="mt-3">
        <p className="text-sm font-medium">{W.items}</p>
        <ul className="mt-1 space-y-0.5 text-sm">
          {(o.items ?? []).map((it, i) => (
            <li key={i}>
              {it.title} × {it.qty}
            </li>
          ))}
        </ul>
      </div>

      {o.greeting_note && (
        <p className="mt-2 rounded-md bg-muted p-2 text-sm">
          <span className="font-medium">{W.greeting}:</span> {o.greeting_note}
        </p>
      )}
      {o.notes && (
        <p className="mt-2 text-sm">
          <span className="font-medium">{W.notes}:</span> {o.notes}
        </p>
      )}

      <div className="mt-3">
        <PaymentLine o={o} />
      </div>

      <Button className="mt-3 h-14 w-full text-base" onClick={onDeliver} disabled={busy}>
        <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
        {busy ? "מעדכן…" : W.markDelivered}
      </Button>
    </li>
  );
}

export function DeliveriesView() {
  const { toast } = useToast();
  const { data, error, loading, reload } = useStaffData<DeliveriesData>("/api/staff/deliveries", POLL_MS);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<"pending" | "delivered">("pending");

  async function deliver(o: DeliveryOrder) {
    if (!window.confirm(`${W.deliverConfirm}\n${o.customer_name}`)) return;
    setBusy(o.id);
    try {
      await api(`/api/staff/deliveries/${o.id}`, { method: "POST" });
      toast({ title: W.deliveredDone, variant: "success" });
      void reload(true);
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : T.saveError, variant: "error" });
    } finally {
      setBusy(null);
    }
  }

  if (loading && !data) return <LoadingBlock />;
  if (error && !data) return <ErrorBlock text={error} onRetry={() => void reload()} />;
  if (!data) return null;

  if (!data.allowed) {
    return <NoticeBlock icon={<Bike className="h-10 w-10 text-muted-foreground" aria-hidden="true" />} text={W.notCourier} />;
  }

  const pending = data.pending ?? [];
  const delivered = data.delivered ?? [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Stat label={W.toDeliver} value={pending.length} />
        <Stat label={W.delivered} value={delivered.length} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {W.weekCourier}: <strong className="text-foreground">{data.courier.name ?? "לא שובץ"}</strong>
        </p>
        <RefreshButton onClick={() => void reload()} busy={loading} />
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="tablist">
        {(
          [
            ["pending", `${W.toDeliver} (${pending.length})`],
            ["delivered", `${W.delivered} (${delivered.length})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "min-h-[44px] rounded-md text-sm font-medium",
              tab === key ? "bg-background shadow-sm" : "text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "pending" ? (
        pending.length === 0 ? (
          <EmptyBlock text={W.noDeliveries} />
        ) : (
          <ul className="space-y-3">
            {pending.map((o) => (
              <DeliveryCard key={o.id} o={o} busy={busy === o.id} onDeliver={() => void deliver(o)} />
            ))}
          </ul>
        )
      ) : (
        <Card>
          {delivered.length === 0 ? (
            <EmptyBlock text={W.noDelivered} />
          ) : (
            <ul className="divide-y">
              {delivered.map((o) => (
                <li key={o.id} className="py-2.5">
                  <div className="flex justify-between gap-2">
                    <p className="font-medium">{o.customer_name}</p>
                    <p className="text-sm tabular-nums">{formatILS(o.total_amount)}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {o.delivery_address ?? ""}
                    {o.delivered_at ? ` · ${formatDateTime(o.delivered_at)}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
