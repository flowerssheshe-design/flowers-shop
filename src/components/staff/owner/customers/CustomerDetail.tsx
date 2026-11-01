"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toaster";
import { StaffPageHeader } from "@/components/staff/StaffShell";
import { formatILS } from "@/lib/utils";
import { T } from "@/lib/staff/labels";
import { Card, EmptyState, ErrorState, Line, LoadingState, fmtDate, fmtDateTime, sendJson, useStaffJson } from "../shared";

type Customer = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  address: string | null;
  notification_opt_in: boolean;
  customer_status: "regular" | "returning";
  discount_percent: number;
  admin_notes: string;
  created_at: string | null;
  source: string | null;
};

type Discount = {
  completedCount: number;
  discountPercent: number;
  threshold: number;
  memberPercent: number;
  personalPercent: number;
  customerStatus: string | null;
};

type OrderSummary = {
  id: string;
  created_at: string;
  status: string;
  order_type: string | null;
  total_amount: number;
  delivery_type: string | null;
  items_count: number;
};

type Data = { customer: Customer; discount: Discount; orders: OrderSummary[] };

const ORDER_TYPE: Record<string, string> = { preorder: T.preorder, live: T.liveOrder, stall: T.stallSale, manual: T.manualOrder };

type Form = {
  full_name: string;
  phone: string;
  address: string;
  customer_status: "regular" | "returning";
  discount_percent: string;
  admin_notes: string;
  notification_opt_in: boolean;
};

function toForm(c: Customer): Form {
  return {
    full_name: c.full_name ?? "",
    phone: c.phone ?? "",
    address: c.address ?? "",
    customer_status: c.customer_status,
    discount_percent: String(c.discount_percent ?? 0),
    admin_notes: c.admin_notes ?? "",
    notification_opt_in: c.notification_opt_in,
  };
}

function discountReason(d: Discount): string {
  if (d.discountPercent <= 0) return "אין הנחה כרגע";
  const member = d.customerStatus === "returning" || d.completedCount >= d.threshold;
  if (d.personalPercent >= d.discountPercent && d.personalPercent > 0) return "הנחה אישית";
  if (member) return d.customerStatus === "returning" ? "לקוח קבוע (סומן ידנית)" : `לקוח קבוע (${d.completedCount} הזמנות)`;
  return "";
}

export function CustomerDetail({ id }: { id: string }) {
  const { data, error, loading, reload } = useStaffJson<Data>(`/api/staff/customers/${id}`);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (data) setForm(toForm(data.customer));
  }, [data]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const pct = Number(form.discount_percent);
    if (form.full_name.trim().length < 2) return setFormError("כתבו שם (לפחות 2 אותיות).");
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) return setFormError("הנחה אישית: מספר בין 0 ל-100.");
    setFormError(null);
    setSaving(true);
    try {
      await sendJson(`/api/staff/customers/${id}`, "PATCH", { ...form, discount_percent: pct });
      toast({ title: T.saved, variant: "success" });
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : T.saveError);
    } finally {
      setSaving(false);
    }
  }

  const back = (
    <Button asChild variant="ghost" size="sm">
      <Link href="/staff/customers">
        <ArrowRight className="h-4 w-4" />
        לכל הלקוחות
      </Link>
    </Button>
  );

  return (
    <div>
      <StaffPageHeader
        title={data?.customer.full_name || data?.customer.email || "לקוח"}
        description={data ? `נרשם ב-${fmtDate(data.customer.created_at, true)}${data.customer.source ? ` · הגיע דרך ${data.customer.source}` : ""}` : undefined}
        actions={back}
      />

      {error && !data && <ErrorState message={error} onRetry={() => void reload()} />}
      {loading && !data && <LoadingState />}

      {data && form && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <Card title="ההנחה שהלקוח מקבל">
              <div className="text-3xl font-bold tabular-nums text-emerald-700">{data.discount.discountPercent}%</div>
              <p className="text-sm text-muted-foreground">{discountReason(data.discount)}</p>
              <div className="mt-2">
                <Line label="הזמנות שהושלמו" value={String(data.discount.completedCount)} />
                <Line label={`לקוח קבוע מ-${data.discount.threshold} הזמנות`} value={`${data.discount.memberPercent}%`} />
                <Line label="הנחה אישית" value={`${data.discount.personalPercent}%`} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">מקבלים את ההנחה הגבוהה מביניהן, לא את שתיהן יחד.</p>
            </Card>

            <Card title="פרטים">
              <form onSubmit={save} className="space-y-4">
                {data.customer.email && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">אימייל: </span>
                    <span dir="ltr">{data.customer.email}</span>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="c-name">שם</Label>
                  <Input id="c-name" className="h-11" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="c-phone">טלפון</Label>
                  <Input id="c-phone" className="h-11" dir="ltr" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="c-address">כתובת</Label>
                  <Input id="c-address" className="h-11" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <Label htmlFor="c-returning">
                    לקוח קבוע
                    <span className="block text-xs font-normal text-muted-foreground">מקבל הנחת לקוח קבוע גם בלי מספיק הזמנות</span>
                  </Label>
                  <Switch
                    id="c-returning"
                    checked={form.customer_status === "returning"}
                    onCheckedChange={(v) => setForm({ ...form, customer_status: v ? "returning" : "regular" })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="c-discount">הנחה אישית (%)</Label>
                  <Input
                    id="c-discount"
                    className="h-11"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={100}
                    step="0.5"
                    value={form.discount_percent}
                    onChange={(e) => setForm({ ...form, discount_percent: e.target.value })}
                  />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <Label htmlFor="c-optin">מאשר לקבל הודעות</Label>
                  <Switch id="c-optin" checked={form.notification_opt_in} onCheckedChange={(v) => setForm({ ...form, notification_opt_in: v })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="c-notes">הערה פנימית</Label>
                  <Textarea id="c-notes" rows={3} value={form.admin_notes} onChange={(e) => setForm({ ...form, admin_notes: e.target.value })} />
                  <p className="text-xs text-muted-foreground">הלקוח לא רואה את ההערה.</p>
                </div>
                {formError && <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{formError}</p>}
                <Button type="submit" size="lg" className="w-full" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {T.save}
                </Button>
              </form>
            </Card>
          </div>

          <Card title={`הזמנות (${data.orders.length})`}>
            {data.orders.length === 0 ? (
              <EmptyState title="עוד אין הזמנות" />
            ) : (
              <ul className="divide-y">
                {data.orders.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium">{fmtDateTime(o.created_at)}</div>
                      <div className="text-xs text-muted-foreground">
                        {T.status[o.status] ?? o.status}
                        {o.order_type && ORDER_TYPE[o.order_type] ? ` · ${ORDER_TYPE[o.order_type]}` : ""} · {o.items_count} זרים
                        {o.delivery_type === "delivery" ? ` · ${T.delivery}` : o.delivery_type === "pickup" ? ` · ${T.pickup}` : ""}
                      </div>
                    </div>
                    <span className="shrink-0 font-bold tabular-nums">{formatILS(o.total_amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
