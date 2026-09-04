"use client";

import Image from "next/image";
import { Minus, Plus, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatILS } from "@/lib/utils";
import {
  CLUB_DISCOUNT_THRESHOLD,
  MEMBER_DISCOUNT_PERCENT,
  type Product,
} from "@/types";

type Props = {
  product: Product;
  qty: number;
  onChange: (qty: number) => void;
  qualifiesForMember: boolean;
};

const FALLBACK =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'><rect width='400' height='300' fill='%23f3f4f6'/><text x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%239ca3af' font-family='Heebo,sans-serif' font-size='24'>פרחים</text></svg>";

export function ProductCard({ product, qty, onChange, qualifiesForMember }: Props) {
  const hasMemberPrice =
    product.price_member > 0 && product.price_member < product.price_standard;
  const showMemberPrice = qualifiesForMember && hasMemberPrice;
  const discountPercent = showMemberPrice
    ? Math.round(
        ((product.price_standard - product.price_member) /
          product.price_standard) *
          100,
      )
    : 0;

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-primary/10 bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-cream">
        {product.image_url ? (
          <Image
            src={product.image_url}
            alt={product.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <Image
            src={FALLBACK}
            alt={product.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover"
            unoptimized
          />
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="space-y-1">
          <h3 className="brand-serif text-lg font-bold leading-tight text-primary">
            {product.title}
          </h3>
          {product.description ? (
            <p className="line-clamp-2 text-sm text-muted-foreground">
              {product.description}
            </p>
          ) : null}
        </div>

        <div className="mt-1 space-y-1.5 rounded-lg border border-primary/10 bg-cream/60 p-3">
          {showMemberPrice ? (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">מחיר רגיל</span>
                <span className="text-base text-muted-foreground line-through tabular-nums">
                  {formatILS(product.price_standard)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-primary">
                  מחיר לקוח קבוע
                </span>
                <span className="brand-serif text-2xl font-bold text-primary tabular-nums">
                  {formatILS(product.price_member)}
                </span>
              </div>
              {discountPercent > 0 && (
                <p className="text-[11px] text-gold-foreground">
                  חיסכון של {discountPercent}% במחיר לקוח קבוע
                </p>
              )}
            </>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">מחיר</span>
              <span className="brand-serif text-2xl font-bold text-primary tabular-nums">
                {formatILS(product.price_standard)}
              </span>
            </div>
          )}
        </div>

        {showMemberPrice ? (
          <p className="text-[11px] leading-snug text-gold-foreground">
            *הנחת לקוח קבוע של {MEMBER_DISCOUNT_PERCENT}% מוענקת לכם באופן
            אוטומטי — {discountPercent}% הנחה על כל הזמנה
          </p>
        ) : (
          <p className="text-[11px] leading-snug text-muted-foreground">
            *הנחת לקוח קבוע של {MEMBER_DISCOUNT_PERCENT}% זמינה למשתמשים רשומים
            שביצעו {CLUB_DISCOUNT_THRESHOLD} הזמנות או יותר באתר
          </p>
        )}

        <div className="mt-auto pt-1">
          {qty === 0 ? (
            <Button
              variant="default"
              className="w-full rounded-full shadow-sm"
              onClick={() => onChange(1)}
              aria-label={`הזמנה מראש של ${product.title}`}
            >
              <ShoppingBag className="h-4 w-4" />
              הזמנה מראש
            </Button>
          ) : (
            <div className="flex items-center justify-between rounded-full border border-primary/20 bg-primary/5 px-2 py-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full"
                onClick={() => onChange(qty + 1)}
                aria-label="הוסף עוד אחד"
              >
                <Plus className="h-4 w-4" />
              </Button>
              <span className="min-w-6 text-center font-bold tabular-nums text-primary">
                {qty}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full"
                onClick={() => onChange(qty - 1)}
                aria-label="הסר אחד"
              >
                <Minus className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}