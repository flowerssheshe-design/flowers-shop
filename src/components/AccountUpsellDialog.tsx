"use client";

import {
  CheckCircle2,
  Loader2,
  LogIn,
  Sparkles,
  Store as StoreIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatILS } from "@/lib/utils";
import { CLUB_DISCOUNT_THRESHOLD, MEMBER_DISCOUNT_PERCENT } from "@/types";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cartSubtotal: number;
  onCreateAccount: () => void;
  onLogin: () => void;
  onContinueAsGuest: () => void;
};

export function AccountUpsellDialog({
  open,
  onOpenChange,
  cartSubtotal,
  onCreateAccount,
  onLogin,
  onContinueAsGuest,
}: Props) {
  const futureSavings = Math.round(
    (cartSubtotal * MEMBER_DISCOUNT_PERCENT) / 100,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0">
        <DialogHeader>
          <DialogTitle>כדאי לכם לפתוח חשבון!</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 p-4 pt-0">
          <div className="rounded-xl border border-gold/40 bg-gold/10 p-3 text-sm">
            <div className="mb-1 inline-flex items-center gap-1.5 font-semibold text-gold-foreground">
              <Sparkles className="h-4 w-4 text-gold" />
              הטבת חבר קבוע מופעלת אחרי {CLUB_DISCOUNT_THRESHOLD} הזמנות
            </div>
            <p className="text-xs text-foreground/80">
              תקבלו <strong>10% הנחה</strong> אוטומטית בקופה בכל הזמנה — לכל החיים.
            </p>
          </div>

          <ul className="space-y-2 text-sm">
            <Bullet text="הנחה של 10% בקופה אחרי 3 הזמנות ראשונות" />
            <Bullet text="מעקב חי אחר כל ההזמנות והסטטוס שלהן" />
            <Bullet text="שמירת פרטי התקשרות והכתובת — להזמנה מהירה" />
            <Bullet text="עדכונים על זרים חדשים ומבצעים לקראת שבת" />
          </ul>

          {cartSubtotal > 0 && futureSavings > 0 && (
            <p className="rounded-md border border-primary/15 bg-cream/60 p-2 text-xs text-foreground/80">
              בעגלה הנוכחית ({formatILS(cartSubtotal)}) — ברגע שתהיו זכאים,
              תחסכו{" "}
              <strong className="text-primary">
                {formatILS(futureSavings)}
              </strong>{" "}
              בקופה.
            </p>
          )}

          <div className="flex flex-col gap-2 pt-1">
            <Button
              size="lg"
              className="w-full rounded-full"
              onClick={onCreateAccount}
            >
              <Sparkles className="h-4 w-4" />
              צרו חשבון תוך 10 שניות
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="w-full rounded-full"
              onClick={onLogin}
            >
              <LogIn className="h-4 w-4" />
              יש לי חשבון — התחברות
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={onContinueAsGuest}
            >
              <StoreIcon className="h-4 w-4" />
              המשך להזמנה כאורח (ללא חשבון)
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <span>{text}</span>
    </li>
  );
}

export function UpsellLoader() {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      טוען…
    </div>
  );
}