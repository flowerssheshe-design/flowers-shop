"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Save, Trash2, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DELIVERY_FEE, MEMBER_DISCOUNT_PERCENT } from "@/lib/constants";
import { calculateMemberPrice, formatILS } from "@/lib/utils";
import { useToast } from "@/components/ui/toaster";
import type { CartItem, DeliveryType, Order, Product, PaymentMethod } from "@/types";

const STATUS_OPTIONS: Array<{ value: Order["status"]; label: string }> = [
  { value: "pending_payment", label: "ממתין לאישור תשלום" },
  { value: "approved", label: "מחכה לשליחה / איסוף" },
  { value: "completed", label: "הושלם (נאסף / נשלח)" },
];

type LineItem = {
  productId: string;
  qty: number;
};

type Props = {
  onOrderCreated?: () => void;
};

export function AdminOrderForm({ onOrderCreated }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryType, setDeliveryType] = useState<DeliveryType>("pickup");
  const [address, setAddress] = useState("");
  const [isMember, setIsMember] = useState(false);
  const [items, setItems] = useState<LineItem[]>([{ productId: "", qty: 1 }]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");
  const [notes, setNotes] = useState("");
  const [greetingNote, setGreetingNote] = useState("");
  const [status, setStatus] = useState<Order["status"]>("pending_payment");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoadingProducts(true);
    fetch("/api/admin/products", { signal: controller.signal, cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        setProducts(data.products ?? []);
      })
      .catch(() => {
        if (!controller.signal.aborted) setProducts([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingProducts(false);
      });
    return () => controller.abort();
  }, [open]);

  useEffect(() => {
    if (products.length > 0 && items.every((it) => !it.productId)) {
      setItems((prev) => prev.map((it) => ({ ...it, productId: products[0]?.id ?? "" })));
    }
  }, [products, items]);

  useEffect(() => {
    if (products.length > 0 && items.length === 0) {
      setItems([{ productId: products[0]?.id ?? "", qty: 1 }]);
    }
  }, [products, items]);

  const productById = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );

  function itemPrice(product: Product | undefined): number {
    if (!product) return 0;
    return isMember
      ? product.price_member > 0
        ? product.price_member
        : product.price_standard
      : product.price_standard;
  }

  const deliveryFee = deliveryType === "delivery" ? DELIVERY_FEE : 0;

  const cartItems = useMemo(() => {
    return items
      .map((it) => {
        const product = productById.get(it.productId);
        if (!product || it.qty <= 0) return null;
        const price = itemPrice(product);
        return {
          productId: product.id,
          title: product.title,
          qty: it.qty,
          price,
          image_url: product.image_url,
        } as CartItem;
      })
      .filter((it): it is CartItem => it !== null);
  }, [items, productById, isMember]);

  const subtotal = cartItems.reduce((s, it) => s + it.price * it.qty, 0);
  const total = subtotal + deliveryFee;

  function addLineItem() {
    setItems((prev) => [...prev, { productId: products[0]?.id ?? "", qty: 1 }]);
  }

  function updateLineItem(index: number, patch: Partial<LineItem>) {
    setItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, ...patch } : it)),
    );
  }

  function removeLineItem(index: number) {
    setItems((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  const hasValidItems = cartItems.length > 0;
  const canSubmit =
    customerName.trim().length >= 2 &&
    customerPhone.trim().length >= 8 &&
    hasValidItems &&
    (deliveryType === "pickup" || address.trim().length >= 4) &&
    paymentMethod !== "";

  function resetForm() {
    setCustomerName("");
    setCustomerPhone("");
    setDeliveryType("pickup");
    setAddress("");
    setIsMember(false);
    setItems([{ productId: "", qty: 1 }]);
    setPaymentMethod("");
    setNotes("");
    setGreetingNote("");
    setStatus("pending_payment");
    setSubmitError(null);
  }

  async function submit() {
    if (!canSubmit || submitting || !hasValidItems) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/admin/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim(),
          delivery_address:
            deliveryType === "delivery" ? address.trim() : null,
          items: cartItems,
          total_amount: total,
          delivery_type: deliveryType,
          delivery_fee: deliveryFee,
          is_member: isMember,
          notes: notes.trim() || null,
          fulfillment_type: deliveryType,
          payment_method: paymentMethod || undefined,
          greeting_note: greetingNote.trim() || null,
          status,
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        let msg = "שמירת ההזמנה נכשלה";
        try {
          const json = JSON.parse(t);
          msg = json.error ?? msg;
        } catch {
          if (t) msg = t;
        }
        throw new Error(msg);
      }
      toast({ title: "ההזמנה נוצרה בהצלחה", variant: "success" });
      onOrderCreated?.();
      setOpen(false);
      resetForm();
    } catch (e) {
      const message = e instanceof Error ? e.message : "שגיאה לא ידועה";
      setSubmitError(message);
      toast({ title: "יצירת ההזמנה נכשלה", description: message, variant: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm" className="rounded-full">
            <Plus className="h-4 w-4 ms-1.5" />
            הוסף הזמנה
          </Button>
        </DialogTrigger>
        <DialogContent className="w-full max-w-2xl p-0">
          <DialogHeader>
            <DialogTitle className="text-xl">הזמנה חדשה מהדוכן</DialogTitle>
          </DialogHeader>

          <div className="max-h-[80vh] space-y-4 overflow-y-auto px-1 pb-2">
            {/* Customer */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="name">שם הלקוח</Label>
                <Input
                  id="name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="ישראל ישראלי"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">טלפון</Label>
                <Input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  dir="ltr"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="050-0000000"
                />
              </div>
            </div>

            {/* Delivery type */}
            <div className="space-y-2">
              <Label>אופן קבלת ההזמנה</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDeliveryType("pickup")}
                  className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-medium transition ${
                    deliveryType === "pickup"
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : "border-primary/15 bg-card hover:bg-accent"
                  }`}
                >
                  איסוף עצמי
                </button>
                <button
                  type="button"
                  onClick={() => setDeliveryType("delivery")}
                  className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-medium transition ${
                    deliveryType === "delivery"
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : "border-primary/15 bg-card hover:bg-accent"
                  }`}
                >
                  משלוח עד הבית
                  <span className="ms-1 rounded-full bg-gold/20 px-1.5 py-0.5 text-xs">
                    +{formatILS(DELIVERY_FEE)}
                  </span>
                </button>
              </div>
            </div>

            {deliveryType === "delivery" && (
              <div className="space-y-1.5">
                <Label htmlFor="address">כתובת למשלוח</Label>
                <Input
                  id="address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="רחוב, מספר בית, קומה"
                />
              </div>
            )}

            {/* Member toggle */}
            <div className="flex items-center justify-between rounded-md border border-primary/10 p-3">
              <div className="space-y-0.5">
                <Label htmlFor="member" className="cursor-pointer">
                  לקוח קבוע
                </Label>
                <p className="text-xs text-muted-foreground">
                  החל תחייב הנחה של {MEMBER_DISCOUNT_PERCENT}% על המוצרים.
                </p>
              </div>
              <Switch
                id="member"
                checked={isMember}
                onCheckedChange={setIsMember}
              />
            </div>

            {/* Items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">פריטים</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={addLineItem}
                  disabled={loadingProducts || products.length === 0}
                >
                  <Plus className="h-3.5 w-4" />
                  הוסף פריט
                </Button>
              </div>

              {loadingProducts ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  טוען מוצרים...
                </div>
              ) : (
                <div className="space-y-2">
                  {items.map((it, index) => {
                    const product = productById.get(it.productId);
                    const lineTotal = itemPrice(product) * it.qty;
                    return (
                      <div
                        key={index}
                        className="grid grid-cols-[1.2fr_0.5fr_0.7fr_auto] items-end gap-2 rounded-md border p-2"
                      >
                        <div className="space-y-1">
                          <Label className="text-xs">מוצר</Label>
                          <select
                            value={it.productId}
                            onChange={(e) =>
                              updateLineItem(index, { productId: e.target.value })
                            }
                            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                          >
                            {products.length === 0 ? (
                              <option value="" disabled>
                                אין מוצרים זמינים
                              </option>
                            ) : (
                              products.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.title}
                                </option>
                              ))
                            )}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">כמות</Label>
                          <Input
                            type="number"
                            min={1}
                            max={999}
                            value={it.qty}
                            onChange={(e) =>
                              updateLineItem(index, {
                                qty: Math.max(1, parseInt(e.target.value) || 1),
                              })
                            }
                            className="h-9"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">סה״כ שורה</Label>
                          <Input
                            value={lineTotal ? formatILS(lineTotal) : "—"}
                            readOnly
                            className="h-9 bg-muted"
                          />
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => removeLineItem(index)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Order summary */}
            <div className="rounded-xl border border-primary/10 bg-cream/60 p-3 text-sm">
              <div className="flex justify-between">
                <span>ביניים</span>
                <span className="tabular-nums">{formatILS(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>דמי משלוח</span>
                <span className="tabular-nums">
                  {deliveryFee > 0 ? formatILS(deliveryFee) : "ללא"}
                </span>
              </div>
              <div className="flex justify-between border-t pt-2 font-bold">
                <span>סה״כ לתשלום</span>
                <span className="brand-serif text-lg text-primary tabular-nums">
                  {formatILS(total)}
                </span>
              </div>
              {isMember && (
                <div className="mt-1 flex items-center gap-1 text-xs text-gold-foreground">
                  <Sparkles className="h-3 w-3 text-gold" />
                  הנחת לקוח קבוע {MEMBER_DISCOUNT_PERCENT}%
                </div>
              )}
            </div>

            {/* Payment + status */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="payment">אמצעי תשלום</Label>
                <select
                  id="payment"
                  value={paymentMethod}
                  onChange={(e) =>
                    setPaymentMethod(e.target.value as PaymentMethod | "")
                  }
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">--</option>
                  <option value="bit">ביט</option>
                  <option value="paybox">PayBox</option>
                  <option value="cash">מזומן</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="status">סטטוס</Label>
                <select
                  id="status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as Order["status"])}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="notes">הערות (לא חובה)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="העדפות צבעים וכולי…"
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="greeting">מכתב / ברכה לזר</Label>
              <Textarea
                id="greeting"
                value={greetingNote}
                onChange={(e) => setGreetingNote(e.target.value)}
                placeholder="טקס לכרטיס..."
                rows={2}
              />
            </div>

            {submitError && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
                {submitError}
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t p-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setOpen(false);
                resetForm();
              }}
              disabled={submitting}
            >
              ביטול
            </Button>
            <Button
              size="sm"
              onClick={submit}
              disabled={!canSubmit || submitting || !hasValidItems}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              צור הזמנה ({formatILS(total)})
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
