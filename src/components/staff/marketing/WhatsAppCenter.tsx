"use client";

import { useStaffRefresh } from "@/lib/staff/refresh";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toaster";
import { T } from "@/lib/staff/labels";
import { cn } from "@/lib/utils";
import { AUTOMATION_LABELS, ML, SEGMENT_LABELS, SEGMENT_NEEDS_WEEKS } from "@/lib/staff/marketing/labels";
import { SEGMENT_KINDS, type SegmentKind } from "@/lib/staff/marketing/segments";
import { PLACEHOLDERS, renderTemplate } from "@/lib/staff/marketing/templates";
import type { AutomationKind } from "@/lib/staff/marketing/automations";
import { Card, EmptyState, ErrorState, Loading, Notice, api, fieldClass, formatDateTime } from "./ui";

type Template = {
  id: string;
  name: string;
  body: string;
  meta_template_name: string | null;
  language: string;
  updated_at: string;
};

type Tab = "send" | "templates" | "auto";
const TABS: { key: Tab; label: string }[] = [
  { key: "send", label: "שליחה" },
  { key: "templates", label: "תבניות" },
  { key: "auto", label: "הודעות אוטומטיות" },
];

const SAMPLE = { name: "שרה", deadline: "שלישי 12:00", site: "flowers.co.il" };

export function WhatsAppCenter({ configured }: { configured: boolean }) {
  const [tab, setTab] = useState<Tab>("send");
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    setError(null);
    try {
      const data = await api<{ templates: Template[] }>("/api/staff/marketing/whatsapp/templates");
      setTemplates(data.templates);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  return (
    <div>
      {!configured && (
        <Notice title={ML.whatsappNotConnectedTitle}>
          <p className="mt-1">כדי לשלוח הודעות וואטסאפ מהמערכת צריך:</p>
          <ul className="mt-2 list-disc space-y-1 pr-5">
            {ML.whatsappNotConnectedSteps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <p className="mt-2 font-medium">{ML.whatsappNotConnectedFoot}</p>
        </Notice>
      )}

      <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-muted p-1" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "min-h-11 flex-1 whitespace-nowrap rounded-lg px-3 text-sm font-medium",
              tab === t.key ? "bg-white shadow-sm" : "text-muted-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error ? (
        <ErrorState message={error} onRetry={loadTemplates} />
      ) : !templates ? (
        <Loading />
      ) : tab === "templates" ? (
        <Templates templates={templates} onChange={setTemplates} />
      ) : tab === "send" ? (
        <Broadcast templates={templates} configured={configured} goToTemplates={() => setTab("templates")} />
      ) : (
        <Automations templates={templates} configured={configured} />
      )}
    </div>
  );
}

// ---------------- Templates ----------------

function Templates({ templates, onChange }: { templates: Template[]; onChange: (t: Template[]) => void }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState<Template | "new" | null>(null);
  const [deleting, setDeleting] = useState<Template | null>(null);

  const remove = async (t: Template) => {
    try {
      await api(`/api/staff/marketing/whatsapp/templates/${t.id}`, { method: "DELETE" });
      onChange(templates.filter((x) => x.id !== t.id));
      toast({ title: "התבנית נמחקה", variant: "success" });
    } catch (e) {
      toast({ title: (e as Error).message, variant: "error" });
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button className="min-h-11" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" aria-hidden="true" /> תבנית חדשה
        </Button>
      </div>
      {templates.length === 0 ? (
        <EmptyState title="עוד אין תבניות">כתבו נוסח פעם אחת והשתמשו בו בשליחה ובהודעות האוטומטיות.</EmptyState>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {templates.map((t) => (
            <li key={t.id}>
              <Card>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold">{t.name}</h3>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {t.meta_template_name ? (
                      <>
                        תבנית Meta: <span dir="ltr">{t.meta_template_name}</span>
                      </>
                    ) : (
                      "טקסט חופשי"
                    )}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm">{t.body}</p>
                <div className="mt-3 flex gap-2">
                  <Button variant="outline" className="min-h-11" onClick={() => setEditing(t)}>
                    <Pencil className="h-4 w-4" aria-hidden="true" /> {T.edit}
                  </Button>
                  <Button variant="ghost" className="min-h-11 text-red-700" onClick={() => setDeleting(t)}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" /> {T.delete}
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <TemplateDialog
          template={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            onChange(
              editing === "new" ? [saved, ...templates] : templates.map((x) => (x.id === saved.id ? saved : x)),
            );
            setEditing(null);
            toast({ title: T.saved, variant: "success" });
          }}
        />
      )}

      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>למחוק את &quot;{deleting?.name}&quot;?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            הודעה אוטומטית שמשתמשת בתבנית הזאת תפסיק להישלח עד שתבחרו לה תבנית אחרת.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleting(null)}>
              {T.cancel}
            </Button>
            <Button variant="destructive" onClick={() => deleting && remove(deleting)}>
              {T.delete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TemplateDialog({
  template,
  onClose,
  onSaved,
}: {
  template: Template | null;
  onClose: () => void;
  onSaved: (t: Template) => void;
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [body, setBody] = useState(template?.body ?? "");
  const [meta, setMeta] = useState(template?.meta_template_name ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const json = { name, body, meta_template_name: meta.trim() || null, language: "he" };
      const data = template
        ? await api<{ template: Template }>(`/api/staff/marketing/whatsapp/templates/${template.id}`, {
            method: "PATCH",
            json,
          })
        : await api<{ template: Template }>("/api/staff/marketing/whatsapp/templates", { method: "POST", json });
      onSaved(data.template);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template ? "עריכת תבנית" : "תבנית חדשה"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="tpl-name">שם התבנית (פנימי)</Label>
            <Input id="tpl-name" className="h-11" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tpl-body">נוסח ההודעה</Label>
            <Textarea id="tpl-body" rows={5} value={body} onChange={(e) => setBody(e.target.value)} required maxLength={1024} />
            <p className="text-xs text-muted-foreground">
              אפשר להוסיף:{" "}
              {Object.entries(PLACEHOLDERS).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  className="mx-1 rounded bg-muted px-1.5 py-0.5 font-mono"
                  onClick={() => setBody((b) => `${b}{${k}}`)}
                  title={label}
                >
                  {`{${k}}`}
                </button>
              ))}
              ({Object.values(PLACEHOLDERS).join(", ")})
            </p>
          </div>
          {body.trim() && (
            <div>
              <p className="text-xs text-muted-foreground">כך זה ייראה:</p>
              <p className="mt-1 whitespace-pre-wrap rounded-lg bg-[#dcf8c6] p-3 text-sm">{renderTemplate(body, SAMPLE)}</p>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="tpl-meta">שם התבנית שאושרה ב-Meta (לא חובה)</Label>
            <Input
              id="tpl-meta"
              dir="ltr"
              className="h-11 text-left"
              value={meta}
              onChange={(e) => setMeta(e.target.value.toLowerCase())}
              placeholder="preorder_reminder"
            />
            <p className="text-xs text-muted-foreground">
              בלי תבנית מאושרת, ההודעה תגיע רק ללקוח שכתב לעסק ב-24 השעות האחרונות. השדות {"{…}"} יישלחו לפי הסדר
              כפרמטרים {"{{1}}, {{2}}"}.
            </p>
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {T.cancel}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? T.saving : T.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Broadcast ----------------

function Broadcast({
  templates,
  configured,
  goToTemplates,
}: {
  templates: Template[];
  configured: boolean;
  goToTemplates: () => void;
}) {
  const { toast } = useToast();
  const [kind, setKind] = useState<SegmentKind>("all");
  const [weeks, setWeeks] = useState(4);
  const [templateId, setTemplateId] = useState<string>(templates[0]?.id ?? "");
  const [preview, setPreview] = useState<{ count: number; segmentTotal: number } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number; total: number } | null>(null);

  const segment = useMemo(
    () => (SEGMENT_NEEDS_WEEKS[kind] ? { kind, weeks } : { kind }),
    [kind, weeks],
  );
  const template = templates.find((t) => t.id === templateId) ?? null;

  useEffect(() => {
    let alive = true;
    setPreview(null);
    setPreviewError(null);
    const t = window.setTimeout(async () => {
      try {
        const data = await api<{ count: number; segmentTotal: number }>("/api/staff/marketing/whatsapp/broadcast", {
          method: "POST",
          json: { segment, confirm: false },
        });
        if (alive) setPreview(data);
      } catch (e) {
        if (alive) setPreviewError((e as Error).message);
      }
    }, 300);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [segment]);

  const send = async () => {
    setSending(true);
    try {
      const data = await api<{ sent: number; failed: number; total: number }>(
        "/api/staff/marketing/whatsapp/broadcast",
        { method: "POST", json: { segment, template_id: templateId, confirm: true } },
      );
      setResult(data);
      toast({ title: `נשלחו ${data.sent} הודעות`, variant: data.failed ? "default" : "success" });
    } catch (e) {
      toast({ title: (e as Error).message, variant: "error" });
    } finally {
      setSending(false);
      setConfirming(false);
    }
  };

  if (templates.length === 0) {
    return (
      <EmptyState title="כדי לשלוח צריך קודם תבנית">
        <Button variant="outline" className="mt-2 min-h-11" onClick={goToTemplates}>
          יצירת תבנית
        </Button>
      </EmptyState>
    );
  }

  return (
    <Card className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="seg">למי לשלוח</Label>
          <select id="seg" className={fieldClass} value={kind} onChange={(e) => setKind(e.target.value as SegmentKind)}>
            {SEGMENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {SEGMENT_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        {SEGMENT_NEEDS_WEEKS[kind] && (
          <div className="space-y-1">
            <Label htmlFor="weeks">{kind === "lapsed" ? "לא הזמינו כבר (שבועות)" : "בשבועות האחרונים"}</Label>
            <Input
              id="weeks"
              type="number"
              inputMode="numeric"
              min={1}
              max={104}
              className="h-11"
              value={weeks}
              onChange={(e) => setWeeks(Math.max(1, Math.min(104, Number(e.target.value) || 1)))}
            />
          </div>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="tpl">תבנית</Label>
        <select id="tpl" className={fieldClass} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        {template && (
          <p className="mt-2 whitespace-pre-wrap rounded-lg bg-[#dcf8c6] p-3 text-sm">{renderTemplate(template.body, SAMPLE)}</p>
        )}
        {template && !template.meta_template_name && (
          <p className="text-xs text-amber-800">
            זו תבנית בלי אישור Meta: היא תגיע רק ללקוחות שכתבו לעסק ב-24 השעות האחרונות.
          </p>
        )}
      </div>

      <div className="rounded-lg bg-muted p-3 text-sm" aria-live="polite">
        {previewError ? (
          <span className="text-red-700">{previewError}</span>
        ) : !preview ? (
          T.loading
        ) : (
          <>
            <span className="text-lg font-bold tabular-nums">{preview.count}</span> לקוחות יקבלו את ההודעה
            {preview.segmentTotal > preview.count && (
              <span className="block text-xs text-muted-foreground">
                (מתוך {preview.segmentTotal} בקבוצה. השאר בלי טלפון או ביקשו לא לקבל הודעות)
              </span>
            )}
          </>
        )}
      </div>

      {result && (
        <p className="text-sm" role="status">
          נשלחו {result.sent} מתוך {result.total}
          {result.failed > 0 && `, ${result.failed} נכשלו`}.
        </p>
      )}

      <Button
        className="min-h-11 w-full sm:w-auto"
        disabled={!configured || !preview || preview.count === 0 || !templateId}
        onClick={() => setConfirming(true)}
      >
        <Send className="h-4 w-4" aria-hidden="true" /> שליחה
      </Button>
      {!configured && <p className="text-xs text-muted-foreground">{ML.whatsappNotConfiguredError}</p>}

      <Dialog open={confirming} onOpenChange={(o) => !o && !sending && setConfirming(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>לשלוח ל-{preview?.count ?? 0} לקוחות?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            התבנית &quot;{template?.name}&quot; תישלח עכשיו בוואטסאפ. אי אפשר לבטל אחרי השליחה, ו-Meta גובה תשלום על כל
            הודעה שיווקית.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={sending}>
              {T.cancel}
            </Button>
            <Button onClick={send} disabled={sending}>
              {sending ? "שולח…" : "כן, לשלוח"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ---------------- Automations ----------------

type AutomationState = {
  kind: AutomationKind;
  is_enabled: boolean;
  template_id: string | null;
  config: Record<string, number>;
};

type AutomationsResponse = {
  configured: boolean;
  cronConfigured: boolean;
  automations: AutomationState[];
  sentLast30Days: Record<string, number>;
  preorderClosing: { weekStart: string; phase: string; sendFrom: string; supplierOrderAt: string };
};

function Automations({ templates, configured }: { templates: Template[]; configured: boolean }) {
  const [data, setData] = useState<AutomationsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api<AutomationsResponse>("/api/staff/marketing/whatsapp/automations"));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useStaffRefresh(load);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <Loading />;

  return (
    <div className="space-y-4">
      {!data.cronConfigured && (
        <Notice title="ההודעות האוטומטיות צריכות תזמון" tone="info">
          <p className="mt-1">
            כדי שהתזכורות ייצאו בזמן, צריך להגדיר בשרת CRON_SECRET (מחרוזת אקראית ארוכה) ושירות תזמון שקורא כל 15–30 דקות
            לכתובת <span dir="ltr">/api/staff/marketing/run-automations</span>.
          </p>
        </Notice>
      )}
      {data.automations.map((a) => (
        <AutomationCard
          key={a.kind}
          initial={a}
          templates={templates}
          sent={data.sentLast30Days[a.kind] ?? 0}
          configured={configured}
          preorderClosing={a.kind === "preorder_closing" ? data.preorderClosing : undefined}
          onSaved={load}
        />
      ))}
    </div>
  );
}

function AutomationCard({
  initial,
  templates,
  sent,
  configured,
  preorderClosing,
  onSaved,
}: {
  initial: AutomationState;
  templates: Template[];
  sent: number;
  configured: boolean;
  preorderClosing?: AutomationsResponse["preorderClosing"];
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [state, setState] = useState(initial);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(state) !== JSON.stringify(initial);
  const label = AUTOMATION_LABELS[state.kind];

  const save = async () => {
    setSaving(true);
    try {
      await api("/api/staff/marketing/whatsapp/automations", { method: "PUT", json: state });
      toast({ title: T.saved, variant: "success" });
      onSaved();
    } catch (e) {
      toast({ title: (e as Error).message, variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const id = `auto-${state.kind}`;
  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold">{label.title}</h3>
          <p className="text-sm text-muted-foreground">{label.description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Label htmlFor={`${id}-on`} className="text-sm">
            {state.is_enabled ? "פעיל" : "כבוי"}
          </Label>
          <Switch
            id={`${id}-on`}
            checked={state.is_enabled}
            onCheckedChange={(v) => setState((s) => ({ ...s, is_enabled: v }))}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${id}-tpl`}>תבנית</Label>
          <select
            id={`${id}-tpl`}
            className={fieldClass}
            value={state.template_id ?? ""}
            onChange={(e) => setState((s) => ({ ...s, template_id: e.target.value || null }))}
          >
            <option value="">בחרו תבנית…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        {state.kind === "preorder_closing" && (
          <div className="space-y-1">
            <Label htmlFor={`${id}-hours`}>כמה שעות לפני ההזמנה מהספק</Label>
            <Input
              id={`${id}-hours`}
              type="number"
              inputMode="numeric"
              min={1}
              max={72}
              className="h-11"
              value={state.config.hours_before ?? 6}
              onChange={(e) =>
                setState((s) => ({ ...s, config: { hours_before: Math.max(1, Math.min(72, Number(e.target.value) || 1)) } }))
              }
            />
          </div>
        )}
        {state.kind === "win_back" && (
          <div className="space-y-1">
            <Label htmlFor={`${id}-weeks`}>אחרי כמה שבועות בלי הזמנה</Label>
            <Input
              id={`${id}-weeks`}
              type="number"
              inputMode="numeric"
              min={1}
              max={52}
              className="h-11"
              value={state.config.weeks ?? 6}
              onChange={(e) =>
                setState((s) => ({ ...s, config: { weeks: Math.max(1, Math.min(52, Number(e.target.value) || 1)) } }))
              }
            />
          </div>
        )}
      </div>

      {preorderClosing && (
        <p className="text-xs text-muted-foreground">
          השבוע: ההזמנה מהספק ב-{formatDateTime(preorderClosing.supplierOrderAt)}
          {preorderClosing.phase === "preorder"
            ? `, התזכורת תצא מ-${formatDateTime(preorderClosing.sendFrom)}.`
            : ". ההזמנות מראש לשבוע הזה כבר נסגרו."}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        נשלחו ב-30 הימים האחרונים: {sent}
        {!configured && " · וואטסאפ עוד לא מחובר, לכן שום הודעה לא תצא."}
      </p>

      <div className="flex justify-end">
        <Button className="min-h-11" disabled={!dirty || saving || (state.is_enabled && !state.template_id)} onClick={save}>
          {saving ? T.saving : T.save}
        </Button>
      </div>
    </Card>
  );
}
