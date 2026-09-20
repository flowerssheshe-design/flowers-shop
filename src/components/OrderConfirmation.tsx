"use client";

import { Button } from "@/components/ui/button";
import { buildBitLink, buildWhatsAppLink, formatILS } from "@/lib/utils";
import { WHATSAPP_NUMBER, PICKUP_ADDRESS } from "@/lib/constants";
import type { Order } from "@/types";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  FileText,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  Store,
  Wallet,
} from "lucide-react";
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
  paymentMethod?: string;
};

const PAYMENT_INFO: Record<
  string,
  {
    icon: React.ElementType;
    title: string;
    colorClass: string;
    bgClass: string;
    borderClass: string;
  }
> = {
  bit: {
    icon: CreditCard,
    title: "תשלום בביט",
    colorClass: "text-primary",
    bgClass: "bg-primary/5",
    borderClass: "border-primary/25",
  },
  paybox: {
    icon: Wallet,
    title: "תשלום בפייבוקס",
    colorClass: "text-primary",
    bgClass: "bg-primary/5",
    borderClass: "border-primary/25",
  },
  cash: {
    icon: Phone,
    title: "תשלום במזומן",
    colorClass: "text-emerald-700",
    bgClass: "bg-emerald-50",
    borderClass: "border-emerald-200",
  },
};

export function OrderConfirmation({
  order,
  bitNumber,
  payboxNumber,
  paymentMethod,
}: Props) {
  const items = Array.isArray(order.items) ? order.items : [];

  const waMsg = [
    `שלום! ביצעתי הזמנה חדשה ב"לתת מהלב"`,
    ``,
    `*שם:* ${order.customer_name} (${order.customer_phone})`,
    `*פריטים:*`,
    ...items.map(
      (it) => `• ${it.title} x${it.qty} — ${formatILS(it.price * it.qty)}`,
    ),
    ``,
    order.delivery_type === "delivery"
      ? `*משלוח:* ${order.delivery_address ?? ""}`
      : `*איסוף עצמי:* ${PICKUP_ADDRESS}`,
    ``,
    `*סה"כ:* *${formatILS(order.total_amount)}*`,
    `שילמתי ב-${
      order.payment_method === "bit"
        ? "ביט"
        : order.payment_method === "paybox"
          ? "פייבוקס"
          : "מזומן"
    } / ממתין לאישור`,
  ].join("\n");

  const waLink = buildWhatsAppLink(WHATSAPP_NUMBER, waMsg);
  const bitLink =
    paymentMethod === "bit" && bitNumber
      ? buildBitLink(bitNumber, order.total_amount, "תשלום ביט בלתת מהלב")
      : null;

  const paymentInfo = PAYMENT_INFO[paymentMethod ?? ""] ?? PAYMENT_INFO.cash;
  const PaymentIcon = paymentInfo.icon;

  const now = new Date();
  const orderDate = order.created_at
    ? new Date(order.created_at)
    : now;
  const orderDateStr = orderDate.toLocaleDateString("he-IL", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

  const steps = [
    { label: "הזמנה", done: true },
    {
      label: "תשלום",
      done: paymentMethod === "cash" || paymentMethod === "bit",
      active: paymentMethod !== "cash" && paymentMethod !== "bit",
    },
    { label: "אישור", done: false, active: paymentMethod !== "bit" && paymentMethod !== "cash" },
  ];

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5 p-4">
      {/* Header */}
      <div className="rounded-2xl border border-primary/15 bg-card p-6 text-center shadow-sm">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-3xl">
          🌸
        </div>
         <h1 className="brand-serif text-2xl font-bold text-primary">
           תודה על ההזמנה!
         </h1>
         <p className="mt-1 text-xs text-muted-foreground">
           {orderDateStr}
         </p>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-between px-2">
        {steps.map((step, idx) => (
          <div key={step.label} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition ${
                  step.done
                    ? "bg-primary text-primary-foreground"
                    : step.active
                      ? "bg-whatsapp text-white"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {step.done ? (
                  <Check className="h-4 w-4" />
                ) : (
                  idx + 1
                )}
              </div>
              <span
                className={`text-[11px] font-medium ${
                  step.done || step.active
                    ? "text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {step.label}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div
                className={`mx-2 h-0.5 w-10 sm:mx-4 sm:w-16 ${
                  step.done ? "bg-primary" : "bg-muted"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Order Summary */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">פרטי הזמנה</h2>
        </div>

        <ul className="divide-y">
          {items.map((it, idx) => (
            <li
              key={`${it.productId}-${idx}`}
              className="flex items-center justify-between py-2.5"
            >
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="text-sm">
                  {it.title}{" "}
                  <span className="text-muted-foreground">×{it.qty}</span>
                </span>
              </div>
              <span className="font-medium tabular-nums text-sm">
                {formatILS(it.price * it.qty)}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-2 flex items-center justify-between border-t pt-3">
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            דמי משלוח
          </span>
          <span className="font-medium tabular-nums text-sm">
            {order.delivery_fee > 0 ? formatILS(order.delivery_fee) : "ללא"}
          </span>
        </div>

        <div className="mt-1 flex items-center justify-between border-t pt-3">
          <span className="font-semibold">סה״כ לתשלום</span>
          <span className="text-xl font-bold text-primary tabular-nums">
            {formatILS(order.total_amount)}
          </span>
        </div>

        <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          {order.delivery_type === "delivery" ? (
            <>
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span>משלוח ל: {order.delivery_address}</span>
            </>
          ) : (
            <>
              <Store className="h-3.5 w-3.5 shrink-0" />
              <span>איסוף עצמי — {PICKUP_ADDRESS}</span>
            </>
          )}
        </div>
      </div>

      {/* Payment Section */}
      <div
        className={`rounded-2xl border-2 ${paymentInfo.borderClass} ${paymentInfo.bgClass} p-5 shadow-sm`}
      >
        <div className="mb-3 flex items-center gap-2">
          <PaymentIcon className={`h-4 w-4 ${paymentInfo.colorClass}`} />
          <h2 className={`font-semibold ${paymentInfo.colorClass}`}>
            {paymentInfo.title}
          </h2>
        </div>

        {paymentMethod === "bit" && (
          <>
            <div className="rounded-lg bg-card/60 p-3 text-sm">
              <p className="text-foreground">
                לשלם <strong className="font-semibold">{formatILS(order.total_amount)}</strong>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                העבר את התשלום למספר לעיל, ולאחר מכן אשר בוואטסאפ.
              </p>
            </div>

            {bitNumber && (
              <div className="rounded-lg border border-primary/15 bg-primary/5 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">מספר ביט:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-semibold text-primary">
                      {bitNumber}
                    </span>
                    <CopyButton value={bitNumber} />
                  </div>
                </div>
              </div>
            )}

            {bitLink && (
              <Button
                asChild
                variant="default"
                size="lg"
                className="mt-3 w-full rounded-xl border-none bg-[#00b2b2] text-white hover:bg-[#009999]"
              >
                <a
                  href={bitLink}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="flex items-center justify-center gap-2">
                    <CreditCard className="h-4 w-4 text-white" />
                    תשלום בביט
                    <ArrowRight className="h-4 w-4 text-white" />
                  </span>
                </a>
              </Button>
            )}

            {!bitLink && bitNumber && (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                לחיצה על כפתור &ldquo;תשלום בביט&rdquo; תפתח את אפליקציית ביט עם המסורת והכמות
                כבר מולאים. אשרו את התשלום ישירות מהאפליקציה.
              </p>
            )}

            {!bitLink && !bitNumber && (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                אנא פנה לנו בוואטסאפ כדי לקבל את פרטי התשלום.
              </p>
            )}
          </>
        )}

        {paymentMethod === "paybox" && (
          <div className="text-sm">
            <p className="text-muted-foreground">בקרוב ניתן יהיה לשלם באמצעות PayBox.</p>
            <p className="mt-2 text-xs text-muted-foreground">
              ניתן לשלם במזומן בזמן האיסוף או להמתין לפייבוקס.
            </p>
          </div>
        )}

        {paymentMethod === "cash" && (
          <div className="text-sm">
            <p className="text-emerald-700">יש לשלם במזומן בזמן איסוף ההזמנה.</p>
          </div>
        )}
      </div>

      {/* Next Steps */}
      <div className="flex items-start gap-3 rounded-xl border border-primary/10 bg-primary/5 p-4">
        <InfoIcon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div>
          <p className="text-sm font-medium text-foreground">מה הלאה?</p>
          <p className="mt-1 text-sm text-muted-foreground">
           לאשר בכפתור על ידי לחיצה. והזמנה תאושר בהקדם אפשרי </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-3">
        <Button
          asChild
          variant="whatsapp"
          size="lg"
          className="w-full h-12 text-base"
        >
          <a href={waLink} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="h-5 w-5" />
            {paymentMethod === "bit"
              ? "אישור תשלום בוואטסאפ"
              : "אישור הזמנה בוואטסאפ"}
          </a>
        </Button>

        <Button asChild variant="outline" size="lg" className="w-full h-12">
          <Link href="/?reset=1" replace scroll={false}>
            <span className="flex items-center justify-center gap-2">
              <Store className="h-4 w-4" />
              חזרה לחנות
              <ArrowRight className="h-4 w-4" />
            </span>
          </Link>
        </Button>
      </div>

      {/* Contact Info */}
      <div className="flex flex-wrap items-center justify-center gap-4 text-center text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Phone className="h-3 w-3" />
          {process.env.NEXT_PUBLIC_BUSINESS_PHONE ?? "05-32455705"}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {process.env.NEXT_PUBLIC_BUSINESS_HOURS ?? "ראשון-חמישי 08:00-18:00"}
        </span>
      </div>
    </div>
  );
}

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}
