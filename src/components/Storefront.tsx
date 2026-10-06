"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  Loader2,
  LogIn,
  ShoppingBag,
  Sparkles,
  Store as StoreIcon,
  Trash2,
  Truck,
  User as UserIcon,
  Phone as PhoneIcon,
  Phone,
  Mail,
  Clock,
  MapPin,
  MessageSquare,
  Zap,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ProductGrid } from "@/components/ProductGrid";
import { SiteHeader } from "@/components/SiteHeader";
import { OrderConfirmation } from "@/components/OrderConfirmation";
import { LoginDialog } from "@/components/LoginDialog";
import { AccountUpsellDialog } from "@/components/AccountUpsellDialog";
import { formatILS } from "@/lib/utils";
import {
  BIT_NUMBER,
  DELIVERY_FEE,
  MEMBER_DISCOUNT_PERCENT,
  PAYBOX_NUMBER,
  PICKUP_ADDRESS,
  BUSINESS_PHONE,
  BUSINESS_EMAIL,
  BUSINESS_HOURS,
  PICKUP_HOURS,
} from "@/lib/constants";
import {
  CLUB_DISCOUNT_THRESHOLD,
  type CartItem,
  type DeliveryType,
  type Order,
  type Product,
  type SessionUser,
} from "@/types";
import { useStoreMode } from "@/context/StoreModeContext";
import { createClient } from "@/lib/supabase/client";

type Props = {
  products: Product[];
  user: SessionUser | null;
  qualifiesForMember: boolean;
  completedOrderCount: number;
};

export function Storefront({
  products,
  user,
  qualifiesForMember,
  completedOrderCount,
}: Props) {
  const searchParams = useSearchParams();
  const { mode, isLoading: storeModeLoading, isStallOpen } = useStoreMode();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginMode, setLoginMode] = useState<"login" | "register">("login");
  const [upsellOpen, setUpsellOpen] = useState(false);
  const [submittedOrder, setSubmittedOrder] = useState<Order | null>(null);
  const [stockById, setStockById] = useState<Record<string, number>>({});
  const [stockLoading, setStockLoading] = useState(true);
  const [liveProducts, setLiveProducts] = useState<Product[]>(products);

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [name, setName] = useState(user?.fullName ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [address, setAddress] = useState(user?.address ?? "");
  const [notes, setNotes] = useState("");
  const [deliveryType, setDeliveryType] = useState<DeliveryType>("pickup");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"bit" | "paybox" | "cash" | "">("");
  const [greetingNote, setGreetingNote] = useState("");

  // Stall status toast state
  const [showStallToast, setShowStallToast] = useState(false);
  const [prevStallOpen, setPrevStallOpen] = useState(isStallOpen);
  const isInitialLoadRef = useRef(true);

  // Show toast when stall status changes (but not on initial load)
  useEffect(() => {
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      setPrevStallOpen(isStallOpen);
      return;
    }
    if (!storeModeLoading && prevStallOpen !== isStallOpen) {
      setShowStallToast(true);
      setPrevStallOpen(isStallOpen);
      // Auto-hide after 5 seconds
      const timer = setTimeout(() => setShowStallToast(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [isStallOpen, storeModeLoading, prevStallOpen]);

  // Fetch inventory for stock display in Live Sale mode
  useEffect(() => {
    async function fetchStock() {
      try {
        const res = await fetch("/api/inventory", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          const stockMap: Record<string, number> = {};
           const availability: Record<string, boolean> = {};
           (data.inventory ?? []).forEach((item: any) => {
             const stock = item.live_stock_count ?? 0;
             stockMap[item.product_id] = stock;
             availability[item.product_id] = stock > 0;
           });
           setStockById(stockMap);
           // Reflect live inventory into product availability so that when
           // an admin cancels/deletes an order and stock is restored, the
           // product becomes purchasable again immediately.
           setLiveProducts((prev) =>
             prev.map((p) =>
               availability[p.id] !== undefined
                 ? { ...p, is_available: availability[p.id] }
                 : p,
             ),
           );
        }
      } catch (e) {
        console.error("Failed to fetch stock:", e);
      } finally {
        setStockLoading(false);
      }
    }
    fetchStock();

    // Realtime subscription + polling fallback for instant and reliable stock updates
    let supabase: ReturnType<typeof createClient> | null = null;
    let channel: ReturnType<
      ReturnType<typeof createClient>["channel"]
    > | null = null;

    // Polling fallback: always refresh stock every 5 seconds (even before
    // mode loads or if Supabase realtime is unavailable)
    const pollInterval = setInterval(fetchStock, 5000);

    if (mode === "realtime") {
      supabase = createClient();
      channel = supabase
        .channel("inventory-changes")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "inventory",
          },
          (payload) => {
            const newRecord = payload.new as { product_id: string; live_stock_count: number } | null;
            const oldRecord = payload.old as { product_id: string; live_stock_count: number } | null;
            const productId = newRecord?.product_id ?? oldRecord?.product_id;
            const stock = newRecord?.live_stock_count ?? 0;
             if (productId) {
              setStockById((prev) => ({ ...prev, [productId]: stock }));
              // Update product availability in real-time so the product list
              // reflects stock changes from order creation/deletion/cancellation.
              setLiveProducts((prev) =>
                prev.map((p) =>
                  p.id === productId
                    ? { ...p, is_available: stock > 0 }
                    : p,
                ),
              );
            }
          }
        )
        .subscribe();
    }

    return () => {
      if (channel && supabase) {
        supabase.removeChannel(channel);
      }
      clearInterval(pollInterval);
    };
  }, [mode]);

  // Keep form in sync when user logs in/out
  useEffect(() => {
    if (user) {
      setName((v) => (v ? v : user.fullName ?? ""));
      setPhone((v) => (v ? v : user.phone ?? ""));
      setAddress((v) => (v ? v : user.address ?? ""));
    }
  }, [user]);

  // Sync liveProducts when the server-rendered products prop changes.
  // This handles cases like a full page reload after server-side updates.
  useEffect(() => {
    setLiveProducts(products);
  }, [products]);

  // If user navigates back to the storefront (e.g. via ?reset=1 or browser back),
  // clear the submitted-order lock so they can shop again.
  useEffect(() => {
    if (searchParams?.get("reset") === "1") {
      setSubmittedOrder(null);
      setQty({});
      setCheckoutOpen(false);
      setCartOpen(false);
      setNotes("");
      try {
        const url = new window.URL(window.location.href);
        url.searchParams.delete("reset");
        window.history.replaceState({}, "", url.toString());
      } catch {
        // ignore
      }
    }
  }, [searchParams]);

  // Cart items always priced per the user's qualification status.
  const cartItems: CartItem[] = useMemo(() => {
    return products
      .filter((p) => (qty[p.id] ?? 0) > 0)
      .map((p) => {
        const price = qualifiesForMember
          ? p.price_member > 0
            ? p.price_member
            : p.price_standard
          : p.price_standard;
        return {
          productId: p.id,
          title: p.title,
          qty: qty[p.id],
          price,
          image_url: p.image_url,
        };
      });
  }, [products, qty, qualifiesForMember]);

  const subtotal = cartItems.reduce((s, it) => s + it.price * it.qty, 0);
  const deliveryFee = deliveryType === "delivery" ? DELIVERY_FEE : 0;
  const total = subtotal + deliveryFee;
  const cartCount = cartItems.reduce((s, it) => s + it.qty, 0);

  const onQtyChange = (id: string, q: number) => {
    setQty((prev) => {
      const next = { ...prev };
      if (q <= 0) delete next[id];
      else next[id] = q;
      return next;
    });
  };
  const removeFromCart = (id: string) => onQtyChange(id, 0);

  const canSubmit =
    name.trim().length >= 2 &&
    phone.trim().length >= 9 &&
    cartItems.length > 0 &&
    (deliveryType === "pickup" || address.trim().length >= 4) &&
    paymentMethod !== "";

   async function submitOrder() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      // Validate stock availability before submitting in realtime mode
      if (mode === "realtime" && !stockLoading) {
        const insufficientItems = cartItems.filter(
          (item) => (stockById[item.productId] ?? 0) < item.qty,
        );
        if (insufficientItems.length > 0) {
          throw new Error(
            `המוצר "${insufficientItems[0].title}" אזל מהמלאי`,
          );
        }
      }
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: name.trim(),
          customer_phone: phone.trim(),
          delivery_address:
            deliveryType === "delivery" ? address.trim() : null,
          items: cartItems,
          total_amount: total,
          delivery_type: deliveryType,
          delivery_fee: deliveryFee,
          is_member: qualifiesForMember,
          notes: notes.trim() || null,
          fulfillment_type: deliveryType,
          payment_method: paymentMethod || undefined,
          greeting_note: greetingNote.trim() || null,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const apiMsg = (errData as { error?: string }).error;
        throw new Error(apiMsg || "שגיאה בשליחת ההזמנה");
      }
      const data = (await res.json()) as { order: Order };
      setSubmittedOrder(data.order);
      setCheckoutOpen(false);
      setCartOpen(false);
      setQty({});
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "שגיאה לא ידועה");
    } finally {
      setSubmitting(false);
    }
  }

  function openCheckout() {
    if (cartItems.length === 0) return;
    if (!user) {
      setUpsellOpen(true);
      return;
    }
    setSubmitError(null);
    setCheckoutOpen(true);
    setCartOpen(false);
  }

  function continueAsGuest() {
    setUpsellOpen(false);
    setCartOpen(false);
    setSubmitError(null);
    setCheckoutOpen(true);
  }

  if (submittedOrder) {
    return (
      <main className="min-h-screen bg-background">
        <SiteHeader cartCount={0} onCartClick={() => undefined} user={user} hasSubmittedOrder />
        <OrderConfirmation
          paymentMethod={submittedOrder.payment_method}
          order={submittedOrder}
          bitNumber={BIT_NUMBER}
          payboxNumber={PAYBOX_NUMBER}
        />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background pb-28">
      <SiteHeader
        cartCount={cartCount}
        onCartClick={() => setCartOpen(true)}
        user={user}
        hasSubmittedOrder={!!submittedOrder}
      />

      {/* Hero */}
      <section className="border-b border-primary/10 bg-gradient-to-b from-cream/70 via-background to-background">
        <div className="container max-w-3xl py-10 text-center sm:py-14">
          <div className="mb-4 flex items-center justify-center gap-2">
            <h2 className="brand-serif text-3xl font-bold leading-tight text-primary sm:text-4xl">
              זרים וסידורי פרחים לכבוד שבת קודש
            </h2>
          </div>
          <p className="mx-auto mb-5 max-w-xl text-balance text-sm text-muted-foreground sm:text-base">
            בחרו את הזר המועדף, הזמינו מראש, ואנו נדאג להכין הכל ברביעי/חמישי לקראת
            שבת קודש. איסוף עצמי או משלוח עד הבית.
          </p>
        </div>
      </section>

      {/* Store / Products */}
      <section id="store" className="container scroll-mt-32 py-10">
        <div className="mb-6 text-center">
          <h3 className="brand-serif text-2xl font-bold text-primary sm:text-3xl">
            חנות
          </h3>
          <div className="divider-gold mx-auto mt-2 h-px w-24" />
          <p className="mt-2 text-sm text-muted-foreground">
            כל הזרים הפעילים. בחרו כמות והמשיכו להזמנה.
          </p>
        </div>
        <ProductGrid
          products={liveProducts}
          qtyById={qty}
          onQtyChange={onQtyChange}
          qualifiesForMember={qualifiesForMember}
          stockById={stockById}
        />
      </section>

      {/* About */}
      <section id="about" className="container scroll-mt-32 py-10">
        <div className="mx-auto max-w-3xl">
          <h3 className="brand-serif text-center text-2xl font-bold text-primary sm:text-3xl">
            אודות לתת מהלב
          </h3>
          <div className="divider-gold mx-auto mt-3 h-px w-24" />

<div className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground sm:text-base">
  <p>
    היי, אנחנו <strong className="text-foreground">דרור ונוה</strong>.
  </p>
  <p>
    הכל התחיל ביום שישי אחד כשראינו כמה ההורים שלנו – משלמים על זר פרחים בסיסי לכבוד שבת. 
    הסתכלנו על המחירים המוגזמים בחוץ והבנו שחייב להיות פה שינוי.
  </p>
  <p>
    בשבילנו, פרחים ביום שישי זה לא סתם קישוט. פרחים זו הדרך הכי פשוטה להגיד תודה, להכניס אור לבית ולתת משהו קטן מכל הלב למי שאוהבים. 
    זה כלי מטורף לשמח אנשים ולחבר בין שכנים ומשפחה.
  </p>
  <p>
    החלטנו להרים את הכפפה ולפתוח את <strong className="text-foreground">&ldquo;לתת מהלב&rdquo;</strong> – משהו משלנו ולמען הקהילה:
  </p>
  
  <ul className="list-disc space-y-2 pr-5 text-foreground">
    <li>
      <strong>מחירים הוגנים:</strong> בלי גזירות ובלי מחירים מנופחים של יום שישי.
    </li>
    <li>
      <strong>איכות וטריות:</strong> זרים יפים, רעננים ומושקעים שבאמת מחזיקים.
    </li>
    <li>
      <strong>שיא הנוחות:</strong> מזמינים מראש באינטרנט, ואוספים בקלות או מקבלים במשלוח עד הבית.
    </li>
  </ul>

  <p>
    בלי סיבוכים ובלי פוזות – פשוט פרחים מעולים במחיר הגיוני, כדי שכל בית יוכל להרשות לעצמו לשמח ולתת מהלב לכבוד שבת.
  </p>
  
  <p className="font-semibold text-foreground pt-2">
    שתהיה שבת שלום! <br />
    דרור & נוה
  </p>
</div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-primary/10 bg-card p-4">
              <h2 className="mb-3 font-semibold text-primary">פרטי התקשרות</h2>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-primary/70" />
                  <a href={`tel:${BUSINESS_PHONE}`} className="hover:text-primary">
                    {BUSINESS_PHONE}
                  </a>
                </li>
                <li className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-primary/70" />
                  <a href={`mailto:${BUSINESS_EMAIL}`} className="hover:text-primary">
                    {BUSINESS_EMAIL}
                  </a>
                </li>
                <li className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary/70" />
                  <span>{BUSINESS_HOURS}</span>
                </li>
              </ul>
            </div>

            <div className="rounded-xl border border-primary/10 bg-card p-4">
              <h2 className="mb-3 font-semibold text-primary">איסוף עצמי</h2>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 text-primary/70" />
                  <span>{PICKUP_ADDRESS}</span>
                </li>
                <li className="flex items-start gap-2">
                  <StoreIcon className="mt-0.5 h-4 w-4 text-primary/70" />
                  <span>
                    איסוף זמין ביום שישי, {PICKUP_HOURS}
                  </span>
                </li>
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">
                בחרו באיסוף עצמי בהזמנה, ואנו נכין את ההזמנה לאיסוף בכתובת
                הנ״ל.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Floating cart bar (mobile) */}
      {cartCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-primary/15 bg-background/95 p-3 backdrop-blur md:hidden">
          <Button
            className="w-full rounded-full"
            size="lg"
            onClick={() => setCartOpen(true)}
          >
            פתח עגלה ({cartCount}) · {formatILS(total)}
          </Button>
        </div>
      )}

      {/* Cart Drawer */}
      <Dialog open={cartOpen} onOpenChange={setCartOpen}>
        <CartDrawer
          cartItems={cartItems}
          subtotal={subtotal}
          total={total}
          deliveryType={deliveryType}
          onRemove={removeFromCart}
          onCheckout={openCheckout}
          onContinue={() => setCartOpen(false)}
        />
      </Dialog>

      {/* Login Modal (gated checkout) */}
      <LoginDialog
        open={loginOpen}
        onOpenChange={setLoginOpen}
        reason="הזמנה דורשת התחברות"
        initialMode={loginMode}
        onSuccess={() => {
          setLoginOpen(false);
          window.location.reload();
        }}
      />

      {/* Account upsell for guest checkout */}
      <AccountUpsellDialog
        open={upsellOpen}
        onOpenChange={setUpsellOpen}
        cartSubtotal={subtotal}
        onCreateAccount={() => {
          setUpsellOpen(false);
          setLoginMode("register");
          setLoginOpen(true);
        }}
        onLogin={() => {
          setUpsellOpen(false);
          setLoginMode("login");
          setLoginOpen(true);
        }}
        onContinueAsGuest={continueAsGuest}
      />

      {/* Checkout Modal */}
      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <CheckoutDialog
          cartItems={cartItems}
          subtotal={subtotal}
          deliveryType={deliveryType}
          setDeliveryType={setDeliveryType}
          name={name}
          setName={setName}
          phone={phone}
          setPhone={setPhone}
          address={address}
          setAddress={setAddress}
          notes={notes}
          setNotes={setNotes}
          canSubmit={canSubmit}
          submitOrder={submitOrder}
          submitting={submitting}
          submitError={submitError}
          qualifiesForMember={qualifiesForMember}
          onBackToCart={() => {
            setCheckoutOpen(false);
            setCartOpen(true);
          }}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
         />
       </Dialog>
      {/* Stall Status Toast - Bottom */}
      {showStallToast && !storeModeLoading && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 animate-slide-up" role="status" aria-live="polite">
          <div
            className={`inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-medium shadow-lg backdrop-blur-sm border transition-all ${
              isStallOpen
                ? "bg-emerald-50/95 dark:bg-emerald-950/95 border-emerald-300/50 dark:border-emerald-700/50 text-emerald-800 dark:text-emerald-300"
                : "bg-gray-50/95 dark:bg-gray-950/95 border-gray-300/50 dark:border-gray-700/50 text-gray-700 dark:text-gray-300"
            }`}
          >
            <span className="text-lg" aria-hidden="true">{isStallOpen ? "🏪" : "🔒"}</span>
            <span>
              {isStallOpen ? "הדוכן נפתח! בואו לבקר" : "הדוכן נסגר — הזמנות מראש בלבד"}
            </span>
            <button
              onClick={() => setShowStallToast(false)}
              className="ml-2 p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 transition"
              aria-label="סגור"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
      <style jsx>{`
        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translate(-50%, 100%);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out forwards;
        }
      `}</style>
    </main>
  );
}

type CartDrawerProps = {
  cartItems: CartItem[];
  subtotal: number;
  total: number;
  deliveryType: DeliveryType;
  onRemove: (id: string) => void;
  onCheckout: () => void;
  onContinue: () => void;
};

function CartDrawer({
  cartItems,
  subtotal,
  total,
  deliveryType,
  onRemove,
  onCheckout,
  onContinue,
}: CartDrawerProps) {
  return (
    <DialogContent className="flex max-w-md flex-col gap-0 p-0">
      <DialogHeader>
        <DialogTitle>העגלה שלי ({cartItems.length})</DialogTitle>
      </DialogHeader>

      <div className="flex-1 overflow-y-auto p-4">
        {cartItems.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <ShoppingBag className="mx-auto mb-2 h-8 w-8 text-primary/40" />
            העגלה ריקה. הוסיפו מוצרים מהקטלוג.
          </div>
        ) : (
          <>
            <ul className="divide-y divide-primary/10">
              {cartItems.map((it) => (
                <li
                  key={it.productId}
                  className="flex items-center justify-between py-3 text-sm"
                >
                  <div className="flex-1">
                    <div className="font-medium">{it.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatILS(it.price)} × {it.qty}
          </div>
          </div>

                        <div className="flex items-center gap-2">
                    <span className="font-semibold tabular-nums text-primary">
                      {formatILS(it.price * it.qty)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-full"
                      onClick={() => onRemove(it.productId)}
                      aria-label="הסר"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>

            {deliveryType === "pickup" && (
                <div className="mt-3 rounded-lg border border-primary/15 bg-primary/5 p-3 text-xs text-muted-foreground">
                  <strong className="text-foreground">לתשומת ליבכם:</strong> הזמנות
                  עם איסוף עצמי יתאספו בכתובת {" "}
                  <span className="font-medium text-foreground">{PICKUP_ADDRESS}</span>.
                  זמני איסוף: שישי 10:00-15:00.
                  <br />
                  <span className="font-medium text-foreground">משלוח עד הבית בשישי:</span> זמין בתחומי ירוחם בלבד.
                </div>
            )}

            <div className="mt-4 space-y-2 rounded-xl border border-primary/10 bg-cream/60 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span>סה״כ ביניים</span>
                <span className="tabular-nums">{formatILS(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-primary/10 pt-2 font-bold">
                <span>סה״כ לתשלום</span>
                <span className="brand-serif text-lg text-primary tabular-nums">
                  {formatILS(total)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                דמי משלוח יתווספו בהמשך לפי בחירת אופן ההזמנה.
              </p>
            </div>

            <div className="mt-4 flex flex-col gap-2">
              <Button
                size="lg"
                className="w-full rounded-full"
                onClick={onCheckout}
              >
                <CheckCircle2 className="h-4 w-4" />
                המשך להזמנה
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="w-full"
                onClick={onContinue}
              >
                המשך לקניות
              </Button>
            </div>
          </>
        )}
      </div>
    </DialogContent>
  );
}

type CheckoutDialogProps = {
  cartItems: CartItem[];
  subtotal: number;
  deliveryType: DeliveryType;
  setDeliveryType: (d: DeliveryType) => void;
  name: string;
  setName: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  address: string;
  setAddress: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  canSubmit: boolean;
  submitOrder: () => void;
  submitting: boolean;
  submitError: string | null;
  qualifiesForMember: boolean;
  onBackToCart: () => void;
  paymentMethod: string;
  setPaymentMethod: (v: "bit" | "paybox" | "cash" | "") => void;
};

function CheckoutDialog(props: CheckoutDialogProps) {
  const {
    cartItems,
    subtotal,
    deliveryType,
    setDeliveryType,
    name,
    setName,
    phone,
    setPhone,
    address,
    setAddress,
    notes,
    setNotes,
    canSubmit,
    submitOrder,
    submitting,
    submitError,
    qualifiesForMember,
    onBackToCart,
    paymentMethod,
    setPaymentMethod,
  } = props;

  const deliveryFee = deliveryType === "delivery" ? DELIVERY_FEE : 0;
  const total = subtotal + deliveryFee;

  return (
    <DialogContent className="flex max-h-[92vh] max-w-lg flex-col gap-0 overflow-hidden p-0">
      <DialogHeader>
        <DialogTitle>פרטי הזמנה</DialogTitle>
      </DialogHeader>

      <div className="flex-1 overflow-y-auto p-4">
        {/* Delivery method */}
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
              <StoreIcon className="h-4 w-4" />
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
              <Truck className="h-4 w-4" />
              משלוח עד הבית
              <span className="ms-1 rounded-full bg-gold/20 px-1.5 py-0.5 text-xs">
                +{formatILS(DELIVERY_FEE)}
              </span>
            </button>
          </div>
        </div>

        {/* Recipient details */}
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="co-name">
                <UserIcon className="me-1 inline h-3.5 w-3.5" />
                שם מלא
              </Label>
              <Input
                id="co-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ישראל ישראלי"
                autoComplete="name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="co-phone">
                <PhoneIcon className="me-1 inline h-3.5 w-3.5" />
                טלפון
              </Label>
              <Input
                id="co-phone"
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="050-0000000"
                autoComplete="tel"
              />
            </div>
          </div>

          {deliveryType === "delivery" && (
            <div className="space-y-1.5">
              <Label htmlFor="co-address">
                <MapPin className="me-1 inline h-3.5 w-3.5" />
                כתובת למשלוח
              </Label>
              <Input
                id="co-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="רחוב, מספר בית, קומה"
                autoComplete="street-address"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="co-notes">
              <MessageSquare className="me-1 inline h-3.5 w-3.5" />
              הערות (לא חובה)
            </Label>
            <Textarea
              id="co-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="העדפות צבעים, מכתב ברכה וכו..."
              rows={2}
            />
  ﻿        </div>
        </div>


        {/* Payment method */}
        <div className='mt-4 space-y-2'>
          <Label>אמצעי תשלום</Label>
          <div className='grid grid-cols-1 gap-2'>
            <button
              type='button'
              onClick={() => setPaymentMethod("bit")}
              className={`flex items-center justify-between rounded-xl border p-3 text-sm font-medium transition ${paymentMethod === "bit"
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-primary/15 bg-card hover:bg-accent"
              }`}
            >
              <span>ביט</span>
              <span className='text-xs opacity-80'>תשלום מהיר</span>
            </button>
            <button
              type='button'
              disabled
              className='flex items-center justify-between rounded-xl border border-primary/15 bg-muted p-3 text-sm text-muted-foreground opacity-70'
            >
              <span>PayBox</span>
              <span className='text-xs'>בקרוב</span>
            </button>
            <button
              type='button'
              onClick={() => deliveryType === "pickup" && setPaymentMethod("cash")}
              disabled={deliveryType !== "pickup"}
              className={`flex items-center justify-between rounded-xl border p-3 text-sm font-medium transition ${paymentMethod === "cash"
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-primary/15 bg-card hover:bg-accent"
              } ${deliveryType !== "pickup" ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <span>מזומן</span>
              <span className='text-xs opacity-80'>באיסוף עצמי</span>
            </button>
          </div>
          {deliveryType !== "pickup" && (
            <p className='text-xs text-muted-foreground'>תשלום במזומן זמין רק לאיסוף עצמי.</p>
          )}
        </div>

        {/* Order summary */}
        <div className="mt-4 rounded-xl border border-primary/10 bg-cream/60 p-3 text-sm">
          <div className="mb-2 flex items-center justify-between font-semibold">
            <span>סיכום הזמנה ({cartItems.length})</span>
          </div>
          <ul className="divide-y divide-primary/10">
            {cartItems.map((it) => (
              <li
                key={it.productId}
                className="flex items-center justify-between py-1.5 text-sm"
              >
                <span className="truncate min-w-0">{it.title} <span className="text-muted-foreground">×{it.qty}</span></span>
                <span className="tabular-nums">
                  {formatILS(it.price * it.qty)}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-2 space-y-1 border-t border-primary/10 pt-2">
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
            <div className="flex items-center justify-between border-t border-primary/10 pt-2 font-bold">
              <span>סה״כ לתשלום</span>
              <span className="brand-serif text-lg text-primary tabular-nums">
                {formatILS(total)}
              </span>
            </div>
            {qualifiesForMember && (
              <div className="flex items-center gap-1 text-xs text-gold-foreground">
                <Sparkles className="h-3 w-3 text-gold" />
                הנחת קונה קבוע של {MEMBER_DISCOUNT_PERCENT}% הופעלה אוטומטית.
              </div>
            )}
          </div>
        </div>

        {submitError && (
          <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
            {submitError}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-primary/10 bg-card p-4">
        <Button
          className="w-full rounded-full"
          size="lg"
          disabled={!canSubmit || submitting}
          onClick={submitOrder}
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              שולח…
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4" />
              שלח הזמנה ({formatILS(total)})
            </>
          )}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full"
          onClick={onBackToCart}
          disabled={submitting}
        >
          חזרה לעגלה
        </Button>
        {!canSubmit && cartItems.length > 0 && (
          <p className="text-center text-xs text-muted-foreground">
            יש למלא שם, טלפון, כתובת (למשלוח) ואמצעי תשלום.
          </p>
        )}
      </div>
    </DialogContent>
  );
}

export function LoginPromptButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="outline" size="sm" className="rounded-full" onClick={onClick}>
      <LogIn className="h-3.5 w-3.5" />
      התחברות
    </Button>
  );
}
