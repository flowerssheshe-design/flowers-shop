"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { T } from "@/lib/staff/labels";
import type { Expense } from "@/types";

export const EXPENSE_CATEGORIES: { value: string; label: string }[] = [
  { value: "advertising", label: "פרסום ושיווק" },
  { value: "fuel", label: "דלק והובלה" },
  { value: "equipment", label: "ציוד וחומרים" },
  { value: "packaging", label: "אריזות" },
  { value: "rent", label: "שכירות" },
  { value: "utilities", label: "חשמל, מים ואינטרנט" },
  { value: "other", label: "אחר" },
];

const LEGACY_LABELS: Record<string, string> = { salaries: "משכורות (ישן)" };

export function categoryLabel(value: string): string {
  return EXPENSE_CATEGORIES.find((c) => c.value === value)?.label ?? LEGACY_LABELS[value] ?? value;
}

function todayISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
}

type Form = {
  description: string;
  amount: string;
  category: string;
  expense_type: "one_time" | "recurring";
  expense_date: string;
  is_active: boolean;
};

function empty(): Form {
  return { description: "", amount: "", category: "other", expense_type: "one_time", expense_date: todayISO(), is_active: true };
}

export type ExpensePayload = {
  description: string;
  amount: number;
  category: string;
  expense_type: "one_time" | "recurring";
  expense_date: string;
  is_active: boolean;
};

export function ExpenseFormDialog({
  open,
  editing,
  onClose,
  onSubmit,
}: {
  open: boolean;
  editing: Expense | null;
  onClose: () => void;
  onSubmit: (payload: ExpensePayload) => Promise<void>;
}) {
  const [form, setForm] = useState<Form>(empty);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(
      editing
        ? {
            description: editing.description,
            amount: String(editing.amount),
            category: editing.category || "other",
            expense_type: editing.expense_type,
            expense_date: editing.expense_date || todayISO(),
            is_active: editing.is_active !== false,
          }
        : empty(),
    );
  }, [open, editing]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(form.amount);
    if (!form.description.trim()) return setError("כתבו על מה ההוצאה.");
    if (!form.amount || !Number.isFinite(amount) || amount < 0) return setError("כתבו סכום תקין (0 ומעלה).");
    if (!form.expense_date) return setError("בחרו תאריך.");
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        description: form.description.trim(),
        amount,
        category: form.category,
        expense_type: form.expense_type,
        expense_date: form.expense_date,
        is_active: form.expense_type === "recurring" ? form.is_active : true,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : T.saveError);
    } finally {
      setBusy(false);
    }
  }

  const recurring = form.expense_type === "recurring";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "עריכת הוצאה" : "הוצאה חדשה"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="סוג ההוצאה">
            {(["one_time", "recurring"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={form.expense_type === t}
                onClick={() => setForm({ ...form, expense_type: t })}
                className={`rounded-lg border p-3 text-sm font-medium ${form.expense_type === t ? "border-primary bg-primary/10 text-primary" : ""}`}
              >
                {t === "one_time" ? "חד-פעמית" : "קבועה (כל שבוע)"}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="exp-desc">על מה</Label>
            <Input
              id="exp-desc"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="למשל: פרסום באינסטגרם, דלק, שקיות"
              className="h-11"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="exp-amount">סכום (₪)</Label>
              <Input
                id="exp-amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-cat">קטגוריה</Label>
              <select
                id="exp-cat"
                className="h-11 w-full rounded-md border bg-background px-2 text-sm"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
                {!EXPENSE_CATEGORIES.some((c) => c.value === form.category) && (
                  <option value={form.category}>{categoryLabel(form.category)}</option>
                )}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="exp-date">{recurring ? "מאיזה תאריך היא חלה" : "תאריך ההוצאה"}</Label>
            <Input
              id="exp-date"
              type="date"
              value={form.expense_date}
              onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
              className="h-11"
            />
            <p className="text-xs text-muted-foreground">
              {recurring
                ? "נספרת בכל שבוע מהשבוע של התאריך הזה והלאה (אפשר גם תאריך בעבר)."
                : "נספרת רק בשבוע של התאריך הזה."}
            </p>
          </div>

          {recurring && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              פעילה (נספרת גם בשבועות הבאים)
            </label>
          )}

          {error && <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              {T.cancel}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {T.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
