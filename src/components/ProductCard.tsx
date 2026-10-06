"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Minus, Plus, ShoppingBag, Store, Truck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImageCarousel } from "@/components/ImageCarousel";
import { formatILS } from "@/lib/utils";
import {
  CLUB_DISCOUNT_THRESHOLD,
  MEMBER_DISCOUNT_PERCENT,
  type Product,
} from "@/types";
import { isPreorderPhase } from "@/lib/cycleTime";
import { useStoreMode } from "@/context/StoreModeContext";

type Props = {
  product: Product;
  qty: number;
  onChange: (qty: number) => void;
  qualifiesForMember: boolean;
  stock?: number;
  /** Eagerly preload the cover image (above-the-fold cards only). */
  priority?: boolean;
};

export function ProductCard({
  product,
  qty,
  onChange,
  qualifiesForMember,
  stock = 0,
  priority = false,
}: Props) {
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

  const inPreorder = isPreorderPhase();
  const { mode } = useStoreMode();
  const isRealtimeMode = mode === "realtime";
  const isOutOfStock = isRealtimeMode && (stock <= 0 || product.is_available === false);

  const [expanded, setExpanded] = useState(false);
  const descRef = useRef<HTMLParagraphElement>(null);
  const [isClamped, setIsClamped] = useState(false);
  const images = product.image_urls?.length
    ? product.image_urls
    : product.image_url
      ? [product.image_url]
      : [];

  useEffect(() => {
    const el = descRef.current;
    if (!el) {
      setIsClamped(false);
      return;
    }
    setIsClamped(el.scrollHeight > el.clientHeight);
  }, [product.description]);

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-primary/10 bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
      <ImageCarousel
        images={images}
        alt={product.title}
        resetKey={product.id}
        priority={priority}
        imageClassName="transition-transform duration-500 ease-out group-hover:scale-105"
      >
        {/* Out of Stock Overlay */}
        {isOutOfStock && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 backdrop-blur-sm rounded-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-background/95 px-4 py-2 text-center shadow-lg">
              <X className="h-5 w-5 text-destructive" aria-hidden="true" />
              <span className="text-sm font-semibold text-foreground">אזל מהמלאי</span>
            </div>
          </div>
        )}
      </ImageCarousel>

      <p className="px-5 pt-2 text-[11px] leading-snug text-muted-foreground">
        התמונות להמחשה בלבד
      </p>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="space-y-1">
          <h3 className="brand-serif text-lg font-bold leading-tight text-primary">
            {product.title}
          </h3>
          {product.description ? (
            <>
              <p
                ref={descRef}
                className={
                  expanded
                    ? "text-sm text-muted-foreground"
                    : "line-clamp-2 text-sm text-muted-foreground"
                }
              >
                {product.description}
              </p>
              {isClamped ? (
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  aria-expanded={expanded}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80"
                >
                  {expanded ? (
                    <>
                      <ChevronUp className="h-3 w-3" />
                      הסתר תיאור
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3 w-3" />
                      הרחב תיאור
                    </>
                  )}
                </button>
              ) : null}
            </>
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
              variant={isOutOfStock ? "outline" : "default"}
              className="w-full rounded-full shadow-sm"
              onClick={() => !isOutOfStock && onChange(1)}
              disabled={isOutOfStock}
            >
              <ShoppingBag className="h-4 w-4" />
              {isOutOfStock
                ? "אזל המלאי"
                : isRealtimeMode
                ? "הוסף לסל"
                : "הזמנה מראש"}
            </Button>
          ) : (
            <div className="flex items-center justify-between rounded-full border border-primary/20 bg-primary/5 px-2 py-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full"
                onClick={() => onChange(qty + 1)}
                aria-label="הוסף עוד אחד"
                disabled={isOutOfStock}
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
