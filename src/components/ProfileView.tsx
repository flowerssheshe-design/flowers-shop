"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  CheckCircle2,
  Loader2,
  Pencil,
  Save,
  Sparkles,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SiteHeader } from "@/components/SiteHeader";
import { formatILS } from "@/lib/utils";
import { CLUB_DISCOUNT_THRESHOLD, type Order, type SessionUser } from "@/types";

type Props = {
  user: SessionUser;
  orders: Order[];
  completedCount: number;
  qualifies: boolean;
  threshold: number;
};

const STATUS_LABEL: Record<Order["status"], string> = {
  pending_payment: "ממתינה",
  approved: "אושרה",
  completed: "הושלמה",
  cancelled: "בוטלה",
  archived: "בארכיון",
};

const STATUS_COLOR: Record<Order["status"], string> = {
  pending_payment: "bg-amber-100 text-amber-800 border-amber-200",
  approved: "bg-blue-100 text-blue-800 border-blue-200",
  completed: "bg-emerald-100 text-emerald-800 border-emerald-200",
  cancelled: "bg-rose-100 text-rose-800 border-rose-200",
  archived: "bg-slate-100 text-slate-700 border-slate-200",
};

export function ProfileView({
  user,
  orders,
  completedCount,
  qualifies,
  threshold,
}: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(user.fullName ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [address, setAddress] = useState(user.address ?? "");
  const [optIn, setOptIn] = useState(user.notification_opt_in ?? true);
  const [optInSaving, setOptInSaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelingOrderId, setCancelingOrderId] = useState<string | null>(null);

  const remaining = Math.max(0, threshold - completedCount);

  async function cancelOrder(order: Order) {
    if (
      !confirm(
        `לבטל את ההזמנה מתאריך ${new Date(order.created_at).toLocaleDateString("he-IL")}?`,
      )
    ) {
      return;
    }
    setCancelingOrderId(order.id);
    setError(null);
    try {
      const res = await fetch(`/api/account/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "ביטול נכשל");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setCancelingOrderId(null);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName.trim(),
          phone: phone.trim(),
          address: address.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error ?? "שמירה נכשלה",
        );
      }
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setSaving(false);
    }
  }

  async function toggleOptIn(next: boolean) {
    setOptInSaving(true);
    setError(null);
    const prev = optIn;
    setOptIn(next);
    try {
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notification_opt_in: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error ?? "שמירה נכשלה",
        );
      }
    } catch (e) {
      setOptIn(prev);
      setError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setOptInSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-background pb-16">
      <SiteHeader cartCount={0} onCartClick={() => undefined} user={user} />

      <div className="container max-w-3xl space-y-6 py-8">
        <header className="text-center">
          <h1 className="brand-serif text-3xl font-bold text-primary sm:text-4xl">
            פרטי החשבון
          </h1>
          <div className="divider-gold mx-auto mt-2 h-px w-32" />
        </header>

        {/* Discount status card */}
        <section
          className={`rounded-2xl border p-4 shadow-sm ${
            qualifies
              ? "border-gold/40 bg-gold/10"
              : "border-primary/15 bg-card"
          }`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                qualifies
                  ? "bg-gold text-gold-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold">
                {qualifies
                  ? "הנחת קונה קבוע מופעלת!"
                  : `נותרו עוד ${remaining} הזמנות לקבלת הנחת קונה קבוע`}
              </h2>
              <p className="mt-1 text-sm text-foreground/80">
                {qualifies
                  ? `ביצעתם ${CLUB_DISCOUNT_THRESHOLD} הזמנות או יותר — מחיר לקוח קבוע מופעל אוטומטית בקופה.`
                  : `ביצעתם ${completedCount} הזמנות עד כה. השלימו עוד ${remaining} כדי לקבל את ההנחה.`}
              </p>
            </div>
          </div>
        </section>

        {/* Personal info */}
        <section className="rounded-2xl border border-primary/15 bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="brand-serif text-xl font-bold text-primary">
              פרטים אישיים
            </h2>
            {!editing ? (
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => setEditing(true)}
              >
                <Pencil className="h-3.5 w-3.5" />
                עריכה
              </Button>
            ) : null}
          </div>

          {!editing ? (
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <Field label="שם מלא" value={user.fullName || "—"} />
              <Field
                label="טלפון"
                value={user.phone || "—"}
                dir="ltr"
                className="text-end"
              />
              <Field
                label="כתובת למשלוח"
                value={user.address || "—"}
                className="sm:col-span-2"
              />
              {user.email ? (
                <Field
                  label="אימייל"
                  value={user.email}
                  dir="ltr"
                  className="text-end sm:col-span-2"
                />
              ) : null}
            </dl>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="p-name">שם מלא</Label>
                  <Input
                    id="p-name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="p-phone">טלפון</Label>
                  <Input
                    id="p-phone"
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    dir="ltr"
                    className="text-end"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-addr">כתובת למשלוח</Label>
                <Input
                  id="p-addr"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="רחוב, מספר בית, קומה"
                />
              </div>

              {error && (
                <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditing(false);
                    setFullName(user.fullName ?? "");
                    setPhone(user.phone ?? "");
                    setAddress(user.address ?? "");
                  }}
                  disabled={saving}
                >
                  <X className="h-3.5 w-3.5" />
                  ביטול
                </Button>
                <Button
                  size="sm"
                  className="rounded-full"
                  onClick={save}
                  disabled={saving}
                >
                  {saving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  שמור
                </Button>
              </div>
            </div>
          )}
        </section>

        {/* Notification preferences */}
        <section className="rounded-2xl border border-primary/15 bg-card p-5 shadow-sm">
          <h2 className="brand-serif mb-3 flex items-center gap-2 text-xl font-bold text-primary">
            <Bell className="h-5 w-5" />
            העדפות הודעות
          </h2>
          <label
            htmlFor="opt-in"
            className="flex cursor-pointer items-start gap-3 rounded-xl border border-primary/15 bg-cream/40 p-3"
          >
            <Switch
              id="opt-in"
              checked={optIn}
              onCheckedChange={toggleOptIn}
              disabled={optInSaving}
              className="mt-0.5"
            />
            <span className="flex-1 text-sm">
              <span className="block font-medium">
                אישור קבלת הודעות ועדכונים
              </span>
              <span className="block text-xs text-muted-foreground">
                נשלחים עדכוני סטטוס הזמנה, זרים חדשים, מבצעים ועדכונים לקראת שבת
                קודש. ניתן לכבות בכל עת.
              </span>
            </span>
            {optInSaving && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </label>
        </section>

        {/* Order history */}
        <section className="rounded-2xl border border-primary/15 bg-card p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="brand-serif text-xl font-bold text-primary">
              היסטוריית הזמנות
            </h2>
            <span className="text-xs text-muted-foreground">
              {orders.length} הזמנות
            </span>
          </div>

          {orders.length === 0 ? (
            <p className="rounded-xl border border-dashed border-primary/20 bg-cream/40 p-6 text-center text-sm text-muted-foreground">
              עדיין לא ביצעתם הזמנות.{" "}
              <a
                href="/#store"
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                לחנות
              </a>
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-start text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-2 py-2 text-start">תאריך</th>
                    <th className="px-2 py-2 text-start">פריטים</th>
                    <th className="px-2 py-2 text-start">סוג</th>
                    <th className="px-2 py-2 text-start">סה״כ</th>
                    <th className="px-2 py-2 text-start">סטטוס</th>
                    <th className="px-2 py-2 text-start">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => {
                    const items = Array.isArray(o.items) ? o.items : [];
                    return (
                      <tr
                        key={o.id}
                        className="border-t border-primary/10 align-top"
                      >
                        <td className="px-2 py-3 whitespace-nowrap tabular-nums">
                          {new Date(o.created_at).toLocaleDateString("he-IL")}
                        </td>
                        <td className="px-2 py-3">
                          <ul className="space-y-0.5 text-xs">
                            {items.map((it, idx) => (
                              <li key={`${o.id}-${idx}`}>
                                {it.title} <span className="text-muted-foreground">×{it.qty}</span>
                              </li>
                            ))}
                          </ul>
                        </td>
                        <td className="px-2 py-3 whitespace-nowrap">
                          {o.delivery_type === "delivery" ? (
                            <span className="inline-flex items-center gap-1 text-xs">
                              <Truck className="h-3 w-3" />
                              משלוח
                            </span>
                          ) : (
                            <span className="text-xs">איסוף עצמי</span>
                          )}
                        </td>
                        <td className="px-2 py-3 font-semibold tabular-nums">
                          {formatILS(o.total_amount)}
                          {o.is_member ? (
                            <span
                              className="ms-1 inline-flex items-center gap-0.5 text-[10px] text-gold-foreground"
                              title="הוזל לקוח קבוע"
                            >
                              <Sparkles className="h-2.5 w-2.5 text-gold" />
                              חבר
                            </span>
                          ) : null}
                        </td>
                        <td className="px-2 py-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
                              STATUS_COLOR[o.status]
                            }`}
                          >
                            {o.status === "completed" ? (
                              <CheckCircle2 className="h-3 w-3" />
                            ) : null}
                             {STATUS_LABEL[o.status]}
                           </span>
                         </td>
                         <td className="px-2 py-3">
                            {["pending_payment", "approved"].includes(o.status) ? (
                             <Button
                               variant="ghost"
                               size="sm"
                               className="h-7 px-2 text-xs"
                               onClick={() => cancelOrder(o)}
                               disabled={cancelingOrderId === o.id}
                               aria-label={`בטל הזמנה ${o.id}`}
                             >
                               {cancelingOrderId === o.id ? (
                                 <Loader2 className="h-3 w-3 animate-spin" />
                               ) : (
                                 <Trash2 className="h-3 w-3 text-destructive" />
                               )}
                               בטל
                             </Button>
                           ) : null}
                         </td>
                       </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  dir,
  className,
}: {
  label: string;
  value: string;
  dir?: "ltr" | "rtl";
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd
        dir={dir}
        className="mt-0.5 text-sm font-medium text-foreground"
      >
        {value}
      </dd>
    </div>
  );
}