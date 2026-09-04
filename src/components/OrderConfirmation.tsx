"use client";

import { Button } from "@/components/ui/button";
import { buildWhatsAppLink, formatILS } from "@/lib/utils";
import { WHATSAPP_NUMBER, PICKUP_ADDRESS } from "@/lib/constants";
import type { Order } from "@/types";
import { ArrowRight, Copy, Store } from "lucide-react";
import { useState } from "react";
import Link from "next/link";

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="ms-2 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted"
      aria-label="העתק ללוח"
    >
      <Copy className="h-3 w-3" />
      {copied ? "הועתק" : "העתק"}
    </button>
  );
}

type Props = {
  order: Order;
  bitNumber?: string;
  payboxNumber?: string;
};

export function OrderConfirmation({ order, bitNumber, payboxNumber }: Props) {
  const items = Array.isArray(order.items) ? order.items : [];
  const lines = items
    .map((it) => `• ${it.title} x${it.qty} — ${formatILS(it.price * it.qty)}`)
    .join("\n");

  const msg = [
    `הזמנה חדשה מ-${order.customer_name}`,
    `טלפון: ${order.customer_phone}`,
    "",
    lines,
    "",
    `סה״כ: ${formatILS(order.total_amount)}`,
    order.delivery_type === "delivery"
      ? `משלוח ל: ${order.delivery_address ?? ""}`
      : `איסוף עצמי - ${PICKUP_ADDRESS}`,
    "",
    "שילמתי בביט/פייבוקס ✅",
  ].join("\n");

  const waLink = buildWhatsAppLink(WHATSAPP_NUMBER, msg);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 p-4">
      <div className="rounded-2xl border border-primary/15 bg-card p-4 text-center shadow-sm">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-3xl">
          🌸
        </div>
        <h1 className="brand-serif text-2xl font-bold text-primary">
          תודה על ההזמנה!
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          פרחים לכבוד שבת קודש · מספר הזמנה: {order.id.slice(0, 8)}
        </p>
      </div>

      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <h2 className="mb-2 font-semibold">סיכום הזמנה</h2>
        <ul className="divide-y text-sm">
          {items.map((it, idx) => (
            <li
              key={`${it.productId}-${idx}`}
              className="flex items-center justify-between py-2"
            >
              <span className="ms-2">
                {it.title} <span className="text-muted-foreground">×{it.qty}</span>
              </span>
              <span className="font-medium tabular-nums">
                {formatILS(it.price * it.qty)}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center justify-between border-t pt-3">
          <span className="text-sm text-muted-foreground">דמי משלוח</span>
          <span className="font-medium tabular-nums">
            {order.delivery_fee > 0 ? formatILS(order.delivery_fee) : "ללא"}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span className="font-semibold">סה״כ לתשלום</span>
          <span className="text-lg font-bold text-primary tabular-nums">
            {formatILS(order.total_amount)}
          </span>
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          {order.delivery_type === "delivery"
            ? `משלוח ל: ${order.delivery_address}`
            : `איסוף עצמי - ${PICKUP_ADDRESS}`}
        </div>
      </div>

      {(bitNumber || payboxNumber) && (
        <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 shadow-sm">
          <h2 className="mb-2 font-semibold text-primary">
            העברת תשלום ביט / פייבוקס
          </h2>
          {bitNumber ? (
            <div className="mb-1 text-sm">
              <span className="font-medium">ביט:</span>{" "}
              <span dir="ltr" className="tabular-nums">
                {bitNumber}
              </span>
              <CopyButton value={bitNumber} />
            </div>
          ) : null}
          {payboxNumber ? (
            <div className="mb-1 text-sm">
              <span className="font-medium">פייבוקס:</span>{" "}
              <span dir="ltr" className="tabular-nums">
                {payboxNumber}
              </span>
              <CopyButton value={payboxNumber} />
            </div>
          ) : null}
          <p className="mt-2 text-xs text-muted-foreground">
            יש להעביר{" "}
            <strong className="text-foreground">
              {formatILS(order.total_amount)}
            </strong>{" "}
            ולאחר מכן ללחוץ על כפתור הוואטסאפ לאישור.
          </p>
        </div>
      )}

      <Button asChild variant="whatsapp" size="lg" className="w-full">
        <a href={waLink} target="_blank" rel="noopener noreferrer">
          אישור הזמנה בוואטסאפ
        </a>
      </Button>

      <Button asChild variant="outline" size="lg" className="w-full">
        <Link href="/?reset=1" replace scroll={false}>
          <Store className="h-4 w-4" />
          חזרה לחנות
          <ArrowRight className="h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}