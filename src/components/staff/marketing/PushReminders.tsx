"use client";

import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toaster";
import { T } from "@/lib/staff/labels";
import { REMINDER_KINDS, type ReminderConfig, type ReminderKind } from "@/lib/staff/marketing/push-reminders";
import { Card, ErrorState, Loading, api } from "./ui";

const LABELS: Record<ReminderKind, { day: string; hint: string }> = {
  tuesday: { day: "שלישי", hint: "בבוקר, לפני שנסגרת ההזמנה מהספק. {deadline} = שעת ההזמנה מהספק." },
  thursday: { day: "חמישי", hint: "בערב, כשמתכננים את השבת. {left} = כמה זרים עוד אפשר להזמין (אם לא נשאר כלום, לא נשלח)." },
};

/** "התראות אוטומטיות": the weekly Tuesday / Thursday notifications. */
export function PushReminders() {
  const { toast } = useToast();
  const [config, setConfig] = useState<ReminderConfig | null>(null);
  const [sent, setSent] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setError(null);
    try {
      const res = await api<{ config: ReminderConfig; sent: Record<string, string> }>("/api/staff/marketing/push/reminders");
      setConfig(res.config);
      setSent(res.sent ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : T.loadError);
    }
  }
  useEffect(() => {
    void load();
  }, []);

  if (error && !config) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!config) return <Loading />;

  const set = (k: ReminderKind, patch: Partial<ReminderConfig[ReminderKind]>) =>
    setConfig((c) => (c ? { ...c, [k]: { ...c[k], ...patch } } : c));

  async function save() {
    setSaving(true);
    try {
      await api("/api/staff/marketing/push/reminders", { method: "PUT", json: config });
      toast({ title: "ההתראות האוטומטיות נשמרו", variant: "success" });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : T.saveError, variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-start gap-2">
        <CalendarClock className="mt-0.5 h-5 w-5 text-primary" aria-hidden="true" />
        <div>
          <h2 className="text-lg font-semibold">התראות אוטומטיות כל שבוע</h2>
          <p className="text-sm text-muted-foreground">נשלחות לבד לכל מי שאישר התראות, פעם אחת ביום שנבחר, מהשעה שנבחרה.</p>
        </div>
      </div>

      {REMINDER_KINDS.map((k) => {
        const r = config[k];
        return (
          <div key={k} className="space-y-3 rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">יום {LABELS[k].day}</p>
              <label className="flex items-center gap-2 text-sm">
                {r.enabled ? "פעיל" : "כבוי"}
                <Switch checked={r.enabled} onCheckedChange={(v) => set(k, { enabled: v })} aria-label={`התראה ביום ${LABELS[k].day}`} />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">{LABELS[k].hint}</p>
            <div className="flex items-center gap-2">
              <Label htmlFor={`hour-${k}`}>שעה</Label>
              <select
                id={`hour-${k}`}
                value={r.hour}
                onChange={(e) => set(k, { hour: Number(e.target.value) })}
                className="h-10 rounded-md border bg-background px-2 text-sm"
                dir="ltr"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`title-${k}`}>כותרת</Label>
              <Input id={`title-${k}`} value={r.title} maxLength={60} onChange={(e) => set(k, { title: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`body-${k}`}>טקסט</Label>
              <Textarea id={`body-${k}`} value={r.body} maxLength={180} rows={2} onChange={(e) => set(k, { body: e.target.value })} />
            </div>
            {sent[k] && <p className="text-xs text-muted-foreground">נשלחה לאחרונה: {sent[k]}</p>}
          </div>
        );
      })}

      <Button className="h-11" onClick={() => void save()} disabled={saving}>
        {saving ? T.saving : T.save}
      </Button>
    </Card>
  );
}
