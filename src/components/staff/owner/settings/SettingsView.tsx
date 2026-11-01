"use client";

import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toaster";
import { StaffPageHeader } from "@/components/staff/StaffShell";
import { broadcastSystemSettingsUpdate } from "@/lib/useSystemSettings";
import { cn } from "@/lib/utils";
import { DAY_NAMES, T } from "@/lib/staff/labels";
import { phaseLabel } from "@/lib/staff/owner/labels";
import { Card, ErrorState, LoadingState, fmtDateTime, sendJson, useStaffJson } from "../shared";
import { GROUPS, type Field, type Group } from "./fields";

type StoreModeState = {
  setting: "auto" | "preorder" | "realtime";
  mode: "preorder" | "realtime";
  phase: "preorder" | "live";
  supplierOrderAt: string;
  closesAt: string;
};

type Data = { settings: Record<string, unknown>; storeMode: StoreModeState };
type Values = Record<string, string | boolean>;

function toValues(s: Record<string, unknown>): Values {
  const out: Values = {};
  for (const g of GROUPS) {
    for (const f of g.fields) {
      const v = s[f.key];
      out[f.key] = f.kind === "switch" ? v === true || v === "true" : v === null || v === undefined ? "" : String(v);
    }
  }
  return out;
}

const REQUIRED_TIMES = new Set(["supplier_order_time", "week_close_time"]);

/** Converts a group's form values to the API payload, or returns an error message. */
function toPayload(group: Group, values: Values): { payload?: Record<string, unknown>; error?: string } {
  const payload: Record<string, unknown> = {};
  for (const f of group.fields) {
    const raw = values[f.key];
    if (f.kind === "switch") {
      payload[f.key] = Boolean(raw);
      continue;
    }
    const v = String(raw ?? "").trim();
    if (f.kind === "number" || f.kind === "int" || f.kind === "day") {
      const n = Number(v);
      if (v === "" || !Number.isFinite(n) || n < 0 || (f.kind !== "number" && !Number.isInteger(n))) {
        return { error: `"${f.label}": צריך מספר${f.kind === "number" ? "" : " שלם"} מ-0 ומעלה.` };
      }
      if (f.key === "member_discount_percent" && n > 100) return { error: "הנחת לקוח קבוע: עד 100%." };
      payload[f.key] = n;
      continue;
    }
    if (f.kind === "time" && v && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(v)) {
      return { error: `"${f.label}": שעה בפורמט 12:00.` };
    }
    if (f.kind === "time" && !v && REQUIRED_TIMES.has(f.key)) {
      return { error: `"${f.label}": חובה למלא.` };
    }
    if (f.kind === "date" && v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      return { error: `"${f.label}": תאריך לא תקין.` };
    }
    payload[f.key] = v;
  }
  return { payload };
}

function FieldInput({ f, value, onChange }: { f: Field; value: string | boolean; onChange: (v: string | boolean) => void }) {
  const id = `set-${f.key}`;
  if (f.kind === "switch") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
        <Label htmlFor={id}>{f.label}</Label>
        <Switch id={id} checked={Boolean(value)} onCheckedChange={onChange} />
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{f.label}</Label>
      {f.kind === "textarea" ? (
        <Textarea id={id} rows={3} value={String(value)} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder} />
      ) : f.kind === "day" ? (
        <select id={id} className="h-11 w-full rounded-md border bg-background px-2 text-sm" value={String(value)} onChange={(e) => onChange(e.target.value)}>
          {DAY_NAMES.map((d, i) => (
            <option key={d} value={String(i)}>
              {d}
            </option>
          ))}
        </select>
      ) : (
        <Input
          id={id}
          className="h-11"
          dir={f.ltr || f.kind === "time" || f.kind === "date" ? "ltr" : undefined}
          type={f.kind === "time" ? "time" : f.kind === "date" ? "date" : f.kind === "email" ? "email" : f.kind === "url" ? "url" : f.kind === "number" || f.kind === "int" ? "number" : f.kind === "phone" ? "tel" : "text"}
          inputMode={f.kind === "number" ? "decimal" : f.kind === "int" ? "numeric" : undefined}
          step={f.kind === "number" ? "0.5" : undefined}
          min={f.kind === "number" || f.kind === "int" ? 0 : undefined}
          value={String(value)}
          placeholder={f.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
    </div>
  );
}

const MODE_OPTIONS: { value: StoreModeState["setting"]; label: string; hint: string }[] = [
  { value: "auto", label: "אוטומטי (מומלץ)", hint: "הזמנה מראש עד ההזמנה מהספק, ואחריה מכירה בלייב" },
  { value: "preorder", label: "תמיד הזמנה מראש", hint: "הזמנות לא יורדות מהמלאי" },
  { value: "realtime", label: "תמיד מכירה בלייב", hint: "כל הזמנה יורדת מהמלאי מיד" },
];

export function SettingsView() {
  const { data, setData, error, loading, reload } = useStaffJson<Data>("/api/staff/settings");
  const [values, setValues] = useState<Values>({});
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [groupError, setGroupError] = useState<Record<string, string | null>>({});
  const { toast } = useToast();

  useEffect(() => {
    if (data) {
      setValues(toValues(data.settings));
      setDirty({});
    }
  }, [data]);

  function change(group: string, key: string, v: string | boolean) {
    setValues((prev) => ({ ...prev, [key]: v }));
    setDirty((prev) => ({ ...prev, [group]: true }));
  }

  async function saveGroup(group: Group) {
    const { payload, error: err } = toPayload(group, values);
    if (err || !payload) {
      setGroupError((p) => ({ ...p, [group.id]: err ?? T.saveError }));
      return;
    }
    setGroupError((p) => ({ ...p, [group.id]: null }));
    setBusy(group.id);
    try {
      const next = await sendJson<Data>("/api/staff/settings", "POST", { settings: payload });
      setData(next);
      broadcastSystemSettingsUpdate();
      toast({ title: `${group.title}: ${T.saved}`, variant: "success" });
    } catch (e) {
      setGroupError((p) => ({ ...p, [group.id]: e instanceof Error ? e.message : T.saveError }));
    } finally {
      setBusy(null);
    }
  }

  async function setMode(mode: StoreModeState["setting"]) {
    if (!data || mode === data.storeMode.setting) return;
    if (mode !== "auto" && !window.confirm("לקבוע את מצב החנות ידנית? הוא לא יתחלף לבד עד שתחזירו ל״אוטומטי״.")) return;
    setBusy("mode");
    try {
      const next = await sendJson<Data>("/api/staff/settings", "POST", { store_mode: mode });
      setData(next);
      broadcastSystemSettingsUpdate();
      toast({ title: "מצב החנות עודכן", variant: "success" });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : T.saveError, variant: "error" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <StaffPageHeader title="הגדרות" description="כל ההגדרות של החנות והשבוע. כל קבוצה נשמרת בנפרד." />

      {error && !data && <ErrorState message={error} onRetry={() => void reload()} />}
      {loading && !data && <LoadingState />}

      {data && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="מצב החנות" className="lg:col-span-2">
            <p className="mb-3 text-sm text-muted-foreground">
              עכשיו: <b className="text-foreground">{data.storeMode.mode === "realtime" ? "מכירה בלייב" : "הזמנה מראש"}</b> · שלב השבוע:{" "}
              {phaseLabel(data.storeMode.phase)} · הזמנה מהספק {fmtDateTime(data.storeMode.supplierOrderAt)}
            </p>
            <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="מצב החנות">
              {MODE_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={data.storeMode.setting === o.value}
                  disabled={busy !== null}
                  onClick={() => void setMode(o.value)}
                  className={cn(
                    "rounded-lg border p-3 text-start",
                    data.storeMode.setting === o.value ? "border-primary bg-primary/10" : "hover:bg-muted",
                  )}
                >
                  <div className="font-medium">{o.label}</div>
                  <div className="text-xs text-muted-foreground">{o.hint}</div>
                </button>
              ))}
            </div>
          </Card>

          {GROUPS.map((g) => (
            <Card key={g.id} title={g.title}>
              {g.description && <p className="-mt-1 mb-3 text-sm text-muted-foreground">{g.description}</p>}
              <div className="space-y-4">
                {g.fields.map((f) => (
                  <FieldInput key={f.key} f={f} value={values[f.key] ?? ""} onChange={(v) => change(g.id, f.key, v)} />
                ))}
                {groupError[g.id] && <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{groupError[g.id]}</p>}
                <Button onClick={() => void saveGroup(g)} disabled={busy !== null || !dirty[g.id]} className="w-full sm:w-auto" size="lg">
                  {busy === g.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {T.save}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
