"use client";

import { copyText } from "@/lib/copy-text";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Copy, Loader2, MessageCircle, Save, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toaster";
import { StaffPageHeader } from "@/components/staff/StaffShell";
import { T } from "@/lib/staff/labels";
import { OT, phaseLabel } from "@/lib/staff/owner/labels";
import { buildSupplierWhatsApp, finalQtyFor, liveStockFor, type OrderMode, type SupplierLine } from "@/lib/staff/owner/supplier";
import { Card, EmptyState, ErrorState, LoadingState, fmtDateTime, fmtWeek, sendJson, useStaffJson } from "./shared";

type State = {
  week: { weekStart: string; weekEnd: string; phase: "preorder" | "live"; supplierOrderAt: string };
  supplierOrderedAt: string | null;
  lines: SupplierLine[];
  message: string;
};

type Draft = Record<string, { mode: OrderMode; amount: string }>;

function toDraft(lines: SupplierLine[]): Draft {
  return Object.fromEntries(lines.map((l) => [l.product_id, { mode: l.mode, amount: String(l.extra_qty) }]));
}

function int(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

export function SupplierView() {
  const { data, setData, error, loading, reload } = useStaffJson<State>("/api/staff/supplier");
  const [draft, setDraft] = useState<Draft>({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"save" | "send" | "defaults" | "undo" | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (data && !dirty) setDraft(toDraft(data.lines));
  }, [data, dirty]);

  const sent = Boolean(data?.supplierOrderedAt);

  const rows = useMemo(() => {
    return (data?.lines ?? []).map((l) => {
      const d = draft[l.product_id];
      const mode = d?.mode ?? l.mode;
      const amountInput = d?.amount ?? String(l.extra_qty);
      const amount = d ? int(d.amount) : l.extra_qty;
      // Once sent, show what was ordered; before that it follows the mode.
      const final = sent ? l.final_qty : amount === null ? null : finalQtyFor(mode, amount, l.preorder_qty);
      return { ...l, mode, amountInput, amount, final };
    });
  }, [data, draft, sent]);

  const invalid = rows.some((r) => r.amount === null);
  const totals = rows.reduce(
    (t, r) => ({
      pre: t.pre + r.preorder_qty,
      final: t.final + (r.final ?? 0),
      live: t.live + liveStockFor(r.final ?? 0, r.preorder_qty),
    }),
    { pre: 0, final: 0, live: 0 },
  );
  const message = data
    ? buildSupplierWhatsApp(rows.map((r) => ({ title: r.title, final_qty: r.final ?? 0 })), data.week.weekStart, data.week.weekEnd)
    : "";

  function setAmount(id: string, value: string, mode: OrderMode) {
    setDirty(true);
    setDraft((prev) => ({ ...prev, [id]: { mode: prev[id]?.mode ?? mode, amount: value } }));
  }

  /** Switching keeps the same quantity to order: the number is converted to the new mode. */
  function setMode(r: (typeof rows)[number], mode: OrderMode) {
    if (mode === r.mode) return;
    const final = r.final ?? 0;
    const amount = mode === "total" ? final : Math.max(0, final - r.preorder_qty);
    setDirty(true);
    setDraft((prev) => ({ ...prev, [r.product_id]: { mode, amount: String(amount) } }));
  }

  function payloadLines() {
    return rows.map((r) => ({ product_id: r.product_id, mode: r.mode, extra_qty: r.amount ?? 0 }));
  }

  async function save() {
    setBusy("save");
    try {
      const next = await sendJson<State>("/api/staff/supplier", "PUT", { lines: payloadLines() });
      setData(next);
      setDirty(false);
      toast({ title: T.saved, variant: "success" });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : T.saveError, variant: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function markSent() {
    if (!window.confirm(OT.supplier.sendConfirm)) return;
    setBusy("send");
    try {
      const next = await sendJson<State>("/api/staff/supplier", "POST", { action: "send", lines: payloadLines() });
      setData(next);
      setDirty(false);
      toast({ title: "סומן שההזמנה נשלחה. המלאי לבלייב עודכן.", variant: "success" });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : T.saveError, variant: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function undoSent() {
    if (
      !window.confirm(
        "לבטל את סימון השליחה?\nהמלאי יחזור בדיוק למה שהיה לפני הסימון, ואפשר יהיה לשנות כמויות ולשלוח שוב.\nאם כבר חילקתם זרים לדוכנים, כדאי לבדוק את החלוקה אחר כך.",
      )
    )
      return;
    setBusy("undo");
    try {
      const next = await sendJson<State>("/api/staff/supplier", "DELETE", {});
      setData(next);
      setDirty(false);
      toast({ title: "השליחה בוטלה. המלאי חזר למצב הקודם.", variant: "success" });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : T.saveError, variant: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function saveDefaults() {
    if (!window.confirm("לשמור את הבחירה של כל זר (תוספת או כמות קבועה, והמספר) כברירת מחדל לשבועות הבאים?")) return;
    setBusy("defaults");
    try {
      await sendJson("/api/staff/supplier/defaults", "PATCH", {
        items: rows.map((r) => ({ product_id: r.product_id, default_order_qty: r.amount ?? 0, order_mode: r.mode })),
      });
      toast({ title: "ברירות המחדל נשמרו", variant: "success" });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : T.saveError, variant: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function copyMessage() {
    if (await copyText(message)) {
      toast({ title: "ההודעה הועתקה", variant: "success" });
    } else {
      toast({ title: "לא הצלחנו להעתיק. סמנו את הטקסט והעתיקו ידנית.", variant: "error" });
    }
  }

  return (
    <div>
      <StaffPageHeader
        title={OT.supplier.title}
        description={data ? `שבוע ${fmtWeek(data.week.weekStart, data.week.weekEnd)} · ${phaseLabel(data.week.phase)}` : OT.supplier.description}
      />

      {error && !data && <ErrorState message={error} onRetry={() => void reload()} />}
      {loading && !data && <LoadingState />}

      {data && (
        <div className="space-y-4">
          {sent ? (
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <div className="font-medium">
                    {OT.supplier.sentAt} {fmtDateTime(data.supplierOrderedAt)}
                  </div>
                  <div className="text-sm">
                    המלאי לבלייב נקבע לפי הכמויות שלמטה. סימנתם בטעות או צריך לשנות? ״ביטול השליחה״ מחזיר הכל למצב שלפני.
                  </div>
                </div>
              </div>
              <Button variant="outline" className="h-11 border-emerald-300 bg-white md:h-10" onClick={undoSent} disabled={busy !== null}>
                <Undo2 className="h-4 w-4" aria-hidden="true" />
                {busy === "undo" ? T.saving : "ביטול השליחה"}
              </Button>
            </div>
          ) : (
            <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
              מועד ההזמנה מהספק: <b className="text-foreground">{fmtDateTime(data.week.supplierOrderAt)}</b>. “{OT.supplier.preordered}”
              כולל גם הזמנות שממתינות לתשלום. לכל זר בוחרים: <b className="text-foreground">תוספת</b> (מה שהוזמן מראש + עוד) או{" "}
              <b className="text-foreground">כמות קבועה</b> (סה״כ שכולל גם הזמנות מראש וגם לייב; מה שלא הוזמן מראש נשאר ללייב). ״שמירה כברירת מחדל״
              שומרת את הבחירה לשבועות הבאים.
              <span className="mt-2 block font-medium text-foreground">
                אם לא תלחצו ״ההזמנה נשלחה לספק״ עד {fmtDateTime(data.week.supplierOrderAt)}, המערכת תסמן לבד לפי הכמויות שכאן, והאתר יעבור
                למכירה בלייב עם המלאי. את ההודעה לספק שולחים אתם, מתי שנוח באותו יום.
              </span>
            </p>
          )}

          {rows.length === 0 ? (
            <EmptyState title="אין מוצרים פעילים" hint="מוסיפים זרים במסך המוצרים." />
          ) : (
            <Card>
              <div className="hidden grid-cols-[1fr_5rem_11rem_6rem_5rem_5rem] gap-2 border-b pb-2 text-sm font-medium text-muted-foreground md:grid">
                <span>זר</span>
                <span>{OT.supplier.preordered}</span>
                <span>איך מזמינים</span>
                <span>כמה</span>
                <span>{OT.supplier.final}</span>
                <span>{OT.supplier.live}</span>
              </div>
              <ul className="divide-y">
                {rows.map((r) => (
                  <li
                    key={r.product_id}
                    className="grid grid-cols-2 items-center gap-2 py-3 md:grid-cols-[1fr_5rem_11rem_6rem_5rem_5rem]"
                  >
                    <div className="col-span-2 font-medium md:col-span-1">{r.title}</div>
                    <div className="col-span-2 text-sm md:col-span-1">
                      <span className="text-xs text-muted-foreground md:hidden">{OT.supplier.preordered}: </span>
                      <span className="tabular-nums">{r.preorder_qty}</span>
                    </div>
                    <div
                      className="col-span-2 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 md:col-span-1"
                      role="radiogroup"
                      aria-label={`איך מזמינים ${r.title}`}
                    >
                      {(
                        [
                          ["extra", "תוספת"],
                          ["total", "כמות קבועה"],
                        ] as [OrderMode, string][]
                      ).map(([m, label]) => (
                        <button
                          key={m}
                          type="button"
                          role="radio"
                          aria-checked={r.mode === m}
                          disabled={sent}
                          onClick={() => setMode(r, m)}
                          className={cn(
                            "min-h-10 rounded-md px-2 text-sm font-medium transition",
                            r.mode === m ? "bg-background shadow-sm" : "text-muted-foreground",
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <label className="text-sm">
                      <span className="text-xs text-muted-foreground md:hidden">
                        {r.mode === "total" ? "סה״כ (כולל מראש ולייב)" : "תוספת מעבר להזמנות"}
                      </span>
                      <Input
                        inputMode="numeric"
                        type="number"
                        min={0}
                        value={r.amountInput}
                        disabled={sent}
                        aria-invalid={r.amount === null}
                        aria-label={r.mode === "total" ? `כמות קבועה ל${r.title}` : `תוספת ל${r.title}`}
                        onChange={(e) => setAmount(r.product_id, e.target.value, r.mode)}
                        className="h-11"
                      />
                    </label>
                    <div className="text-sm">
                      <span className="text-xs text-muted-foreground md:hidden">{OT.supplier.final}: </span>
                      <b className="text-base tabular-nums">{r.final ?? "—"}</b>
                    </div>
                    <div className="text-sm">
                      <span className="text-xs text-muted-foreground md:hidden">{OT.supplier.live}: </span>
                      <span className="tabular-nums">{liveStockFor(r.final ?? 0, r.preorder_qty)}</span>
                    </div>
                    {r.mode === "total" && r.amount !== null && r.amount < r.preorder_qty && !sent && (
                      <p className="col-span-2 text-xs text-amber-700 md:col-span-6">
                        הוזמנו מראש {r.preorder_qty}, יותר מ-{r.amount}. מזמינים {r.preorder_qty} כדי לכסות את ההזמנות.
                      </p>
                    )}
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex flex-wrap justify-between gap-2 border-t pt-3 text-sm font-medium">
                <span>{T.total}</span>
                <span className="tabular-nums">
                  הוזמן מראש {totals.pre} · להזמין {totals.final} · לבלייב {totals.live}
                </span>
              </div>
              {invalid && <p className="mt-2 text-sm text-destructive">יש כמויות לא תקינות. מספרים שלמים מ-0 ומעלה בלבד.</p>}
              {!sent && (
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <Button onClick={() => void save()} disabled={busy !== null || invalid || !dirty} variant="outline" size="lg">
                    {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {T.save}
                  </Button>
                  <Button onClick={() => void saveDefaults()} disabled={busy !== null || invalid} variant="ghost" size="lg">
                    {busy === "defaults" && <Loader2 className="h-4 w-4 animate-spin" />}
                    {OT.supplier.saveDefault}
                  </Button>
                  <Button onClick={() => void markSent()} disabled={busy !== null || invalid} size="lg" className="sm:ms-auto">
                    {busy === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    {OT.supplier.send}
                  </Button>
                </div>
              )}
            </Card>
          )}

          <Card title="הודעה לספק">
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 font-sans text-sm">{message}</pre>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" size="lg" onClick={() => void copyMessage()}>
                <Copy className="h-4 w-4" />
                {OT.supplier.copy}
              </Button>
              <Button asChild variant="whatsapp" size="lg">
                <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="h-4 w-4" />
                  {OT.supplier.whatsapp}
                </a>
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
