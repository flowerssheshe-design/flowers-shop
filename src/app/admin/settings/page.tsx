"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, LogOut, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  clearAdminAuth,
  isAdminAuthenticated,
} from "@/components/AdminGate";
import { AdminNav } from "@/components/AdminNav";
import { useToast } from "@/components/ui/toaster";
import {
  broadcastSystemSettingsUpdate,
  useSystemSettings,
} from "@/lib/useSystemSettings";
import { useSystemSettingsContext } from "@/context/SystemSettingsContext";
import type { SystemSettings } from "@/lib/useSystemSettings.types";
import { formatILS } from "@/lib/utils";

type TabId = "pricing" | "timing" | "contact";

const TABS: { id: TabId; label: string }[] = [
  { id: "pricing", label: "תמחור ומשלוחים" },
  { id: "timing", label: "זמנים ומועדים" },
  { id: "contact", label: "פרטי התקשרות ותשלום" },
];

type SettingsForm = {
  delivery_fee: string;
  member_discount_percent: string;
  club_discount_threshold: string;
  preorder_deadline: string;
  same_day_deadline: string;
  pickup_hours: string;
  business_hours: string;
  business_phone: string;
  whatsapp_number: string;
  bit_number: string;
  paybox_number: string;
  pickup_address: string;
  pickup_instructions: string;
  announcement_banner_text: string;
};

function toForm(settings: SystemSettings): SettingsForm {
  return {
    delivery_fee: String(settings.delivery_fee ?? ""),
    member_discount_percent: String(settings.member_discount_percent ?? ""),
    club_discount_threshold: String(settings.club_discount_threshold ?? ""),
    preorder_deadline: settings.preorder_deadline ?? "",
    same_day_deadline: settings.same_day_deadline ?? "",
    pickup_hours: settings.pickup_hours ?? "",
    business_hours: settings.business_hours ?? "",
    business_phone: settings.business_phone ?? "",
    whatsapp_number: settings.whatsapp_number ?? "",
    bit_number: settings.bit_number ?? "",
    paybox_number: settings.paybox_number ?? "",
    pickup_address: settings.pickup_address ?? "",
    pickup_instructions: settings.pickup_instructions ?? "",
    announcement_banner_text: settings.announcement_banner_text ?? "",
  };
}

const TIME_HINT = "פורמט HH:MM (24 שעות), לדוגמה 10:00";

export default function AdminSettingsPage() {
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<TabId>("pricing");
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const settings = useSystemSettings();
  const ctx = useSystemSettingsContext();

  useEffect(() => {
    if (!isDirty) {
      setForm(toForm(settings));
    }
  }, [settings, isDirty]);

  useEffect(() => {
    if (!isAdminAuthenticated()) {
      window.location.replace("/admin");
      return;
    }
    setReady(true);
  }, []);

  function update(key: keyof SettingsForm, value: string) {
    setIsDirty(true);
    setForm((prev) => (prev ? ({ ...prev, [key]: value } as SettingsForm) : prev));
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    setError(null);

    const payload: Record<string, string | number> = {};

    if (tab === "pricing") {
      const deliveryFee = Number(form.delivery_fee);
      const memberPercent = Number(form.member_discount_percent);
      const clubThreshold = Number(form.club_discount_threshold);
      if (!Number.isFinite(deliveryFee) || deliveryFee < 0) {
        setError("דמי משלוח חייבים להיות מספר חיובי");
        setSaving(false);
        return;
      }
      if (
        !Number.isFinite(memberPercent) ||
        memberPercent < 0 ||
        memberPercent > 100
      ) {
        setError("אחוז הנחה ללקוח קבוע חייב להיות בין 0 ל-100");
        setSaving(false);
        return;
      }
      if (!Number.isFinite(clubThreshold) || clubThreshold < 0) {
        setError("סף הנחת מועדון חייב להיות מספר חיובי");
        setSaving(false);
        return;
      }
      payload.delivery_fee = deliveryFee;
      payload.member_discount_percent = memberPercent;
      payload.club_discount_threshold = clubThreshold;
    } else if (tab === "timing") {
      const timePattern = /^\d{1,2}:\d{2}$/;
      if (form.preorder_deadline && !timePattern.test(form.preorder_deadline)) {
        setError("שעת סגירת הזמנה מראש חייבת להיות בפורמט HH:MM");
        setSaving(false);
        return;
      }
      if (form.same_day_deadline && !timePattern.test(form.same_day_deadline)) {
        setError("שעת סגירת הזמנה ביום שישי חייבת להיות בפורמט HH:MM");
        setSaving(false);
        return;
      }
      payload.preorder_deadline = form.preorder_deadline;
      payload.same_day_deadline = form.same_day_deadline;
      payload.pickup_hours = form.pickup_hours;
      payload.business_hours = form.business_hours;
    } else {
      payload.business_phone = form.business_phone;
      payload.whatsapp_number = form.whatsapp_number;
      payload.bit_number = form.bit_number;
      payload.paybox_number = form.paybox_number;
      payload.pickup_address = form.pickup_address;
      payload.pickup_instructions = form.pickup_instructions;
      payload.announcement_banner_text = form.announcement_banner_text;
    }

    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "שמירה נכשלה");
      }
      toast({ title: "ההגדרות נשמרו", variant: "success" });
      broadcastSystemSettingsUpdate();
      await ctx?.refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : "שגיאה";
      setError(message);
      toast({ title: "שמירה נכשלה", description: message, variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  function logout() {
    clearAdminAuth();
    window.location.replace("/admin");
  }

  if (!ready || !form) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </main>
    );
  }

  const deliveryFeeNum = Number(form.delivery_fee);

  return (
    <main className="min-h-screen bg-muted/30 pb-12">
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <div className="container flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
          <AdminNav />
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/" target="_blank">
                <ExternalLink className="h-4 w-4" />
                חנות
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/stall" target="_blank">
                <ExternalLink className="h-4 w-4" />
                דוכן
              </Link>
            </Button>
            <Button size="sm" variant="ghost" onClick={logout}>
              <LogOut className="h-4 w-4" />
              יציאה
            </Button>
          </div>
        </div>
      </header>

      <div className="container space-y-4 py-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">הגדרות המערכת</h1>
          <p className="text-sm text-muted-foreground mt-1">
            ערכי החנות המרכזיים — שינויים מתעדכנים מיידית בכל המסכים
          </p>
        </div>

        <div className="flex gap-1 border-b" role="tablist" aria-label="קטגוריות הגדרות">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={
                tab === t.id
                  ? "-mb-px border-b-2 border-primary px-4 py-2 text-sm font-medium text-primary"
                  : "-mb-px border-b-2 border-transparent px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <section className="rounded-xl border bg-card p-6 shadow-sm">
          {tab === "pricing" && (
            <div className="max-w-xl space-y-5">
              <div className="space-y-2">
                <Label htmlFor="delivery_fee">דמי משלוח (₪)</Label>
                <div className="flex items-center gap-3">
                  <Input
                    id="delivery_fee"
                    type="number"
                    min="0"
                    step="0.5"
                    dir="ltr"
                    className="max-w-[180px]"
                    value={form.delivery_fee}
                    onChange={(e) => update("delivery_fee", e.target.value)}
                  />
                  <span className="text-sm text-muted-foreground tabular-nums">
                    שווה כעת:{" "}
                    {formatILS(Number.isFinite(deliveryFeeNum) ? deliveryFeeNum : 0)}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="member_discount_percent">אחוז הנחה ללקוח קבוע (%)</Label>
                <Input
                  id="member_discount_percent"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  dir="ltr"
                  className="max-w-[180px]"
                  value={form.member_discount_percent}
                  onChange={(e) => update("member_discount_percent", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="club_discount_threshold">
                  סף הנחת מועדון (מספר מוצרים בעגלה)
                </Label>
                <Input
                  id="club_discount_threshold"
                  type="number"
                  min="0"
                  step="1"
                  dir="ltr"
                  className="max-w-[180px]"
                  value={form.club_discount_threshold}
                  onChange={(e) => update("club_discount_threshold", e.target.value)}
                />
              </div>
            </div>
          )}

          {tab === "timing" && (
            <div className="max-w-xl space-y-5">
              <div className="space-y-2">
                <Label htmlFor="preorder_deadline">שעת סגירת הזמנה מראש (ראשון–חמישי)</Label>
                <Input
                  id="preorder_deadline"
                  type="time"
                  dir="ltr"
                  className="max-w-[180px]"
                  value={form.preorder_deadline}
                  onChange={(e) => update("preorder_deadline", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">{TIME_HINT}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="same_day_deadline">שעת סגירת הזמנה ביום שישי (מכירה חיה)</Label>
                <Input
                  id="same_day_deadline"
                  type="time"
                  dir="ltr"
                  className="max-w-[180px]"
                  value={form.same_day_deadline}
                  onChange={(e) => update("same_day_deadline", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">{TIME_HINT}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pickup_hours">שעות איסוף מהחנות</Label>
                <Input
                  id="pickup_hours"
                  dir="ltr"
                  placeholder="10:00-15:00"
                  className="max-w-[240px]"
                  value={form.pickup_hours}
                  onChange={(e) => update("pickup_hours", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="business_hours">שעות פעילות העסק</Label>
                <Input
                  id="business_hours"
                  className="max-w-[420px]"
                  placeholder="ראשון-חמישי 08:00-18:00, שישי 09:00-14:00"
                  value={form.business_hours}
                  onChange={(e) => update("business_hours", e.target.value)}
                />
              </div>
            </div>
          )}

          {tab === "contact" && (
            <div className="max-w-xl space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="business_phone">טלפון העסק</Label>
                  <Input
                    id="business_phone"
                    dir="ltr"
                    placeholder="05-32455705"
                    value={form.business_phone}
                    onChange={(e) => update("business_phone", e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="whatsapp_number">מספר וואטסאפ</Label>
                  <Input
                    id="whatsapp_number"
                    dir="ltr"
                    placeholder="972500000000"
                    value={form.whatsapp_number}
                    onChange={(e) => update("whatsapp_number", e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    עם קידומת בינלאומית, ללא סימן +
                  </p>
                </div>

<div className="space-y-2">
                  <Label htmlFor="bit_number">
                    מספר ביט / קישור תשלום ביט
                  </Label>
                  <Input
                    id="bit_number"
                    dir="ltr"
                    placeholder="0500000000 או https://bit.ly/..."
                    value={form.bit_number}
                    onChange={(e) => update("bit_number", e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    הזינו מספר טלפון או קישור קבוצת/תשלום ביט (מתחיל ב-http://, https:// או bit://)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="paybox_number">מספר פייבקס</Label>
                  <Input
                    id="paybox_number"
                    dir="ltr"
                    value={form.paybox_number}
                    onChange={(e) => update("paybox_number", e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pickup_address">כתובת איסוף</Label>
                <Input
                  id="pickup_address"
                  className="max-w-[480px]"
                  value={form.pickup_address}
                  onChange={(e) => update("pickup_address", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="pickup_instructions">הנחיות איסוף</Label>
                <Textarea
                  id="pickup_instructions"
                  rows={3}
                  className="max-w-[560px]"
                  value={form.pickup_instructions}
                  onChange={(e) => update("pickup_instructions", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="announcement_banner_text">
                  טקסט כרוזית (אופציונלי)
                </Label>
                <Textarea
                  id="announcement_banner_text"
                  rows={2}
                  className="max-w-[560px]"
                  placeholder="הודעה שתוצג בראש החנות — השאירו ריק כדי להסתיר"
                  value={form.announcement_banner_text}
                  onChange={(e) =>
                    update("announcement_banner_text", e.target.value)
                  }
                />
              </div>
            </div>
          )}

          <div className="mt-6 border-t pt-5">
            <Button onClick={save} disabled={saving}>
              <Save className="h-4 w-4" />
              {saving ? "שומר…" : "שמור הגדרות"}
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}
