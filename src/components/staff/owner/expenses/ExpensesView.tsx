"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { StaffPageHeader } from "@/components/staff/StaffShell";
import { formatILS } from "@/lib/utils";
import { T } from "@/lib/staff/labels";
import type { Expense } from "@/types";
import { Card, EmptyState, ErrorState, LoadingState, fmtDate, sendJson, useStaffJson } from "../shared";
import { ExpenseFormDialog, categoryLabel, type ExpensePayload } from "./ExpenseForm";
import { ExpensesSummaryCard, type SummaryResponse } from "./ExpensesSummary";

type Data = { expenses: Expense[] };

function ExpenseItem({ e, onEdit, onDelete }: { e: Expense; onEdit: () => void; onDelete: () => void }) {
  const recurring = e.expense_type === "recurring";
  const inactive = recurring && e.is_active === false;
  return (
    <li className="flex items-center gap-2 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">{e.description}</span>
          {inactive && <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">לא פעילה</span>}
        </div>
        <div className="text-xs text-muted-foreground">
          {categoryLabel(e.category)} · {recurring ? `כל שבוע, מ-${fmtDate(e.expense_date ?? e.created_at, true)}` : fmtDate(e.expense_date ?? e.created_at, true)}
        </div>
      </div>
      <span className="shrink-0 font-bold tabular-nums">{formatILS(e.amount)}</span>
      <Button size="icon" variant="ghost" onClick={onEdit} aria-label={`עריכת ${e.description}`}>
        <Pencil className="h-4 w-4" />
      </Button>
      <Button size="icon" variant="ghost" onClick={onDelete} aria-label={`מחיקת ${e.description}`} className="text-destructive">
        <Trash2 className="h-4 w-4" />
      </Button>
    </li>
  );
}

export function ExpensesView() {
  const { data, error, loading, reload: reloadList } = useStaffJson<Data>("/api/admin/expenses");
  const summary = useStaffJson<SummaryResponse>("/api/staff/expenses/summary");
  const reloadSummary = summary.reload;
  const reload = async () => {
    await Promise.all([reloadList(), reloadSummary()]);
  };
  const [dialog, setDialog] = useState<{ open: boolean; editing: Expense | null }>({ open: false, editing: null });
  const { toast } = useToast();

  const expenses = data?.expenses ?? [];
  const recurring = expenses.filter((e) => e.expense_type === "recurring");
  const oneTime = expenses.filter((e) => e.expense_type !== "recurring");

  async function submit(payload: ExpensePayload) {
    const editing = dialog.editing;
    await sendJson(editing ? `/api/admin/expenses/${editing.id}` : "/api/admin/expenses", editing ? "PUT" : "POST", payload);
    setDialog({ open: false, editing: null });
    toast({ title: editing ? "ההוצאה עודכנה" : "ההוצאה נוספה", variant: "success" });
    await reload();
  }

  async function remove(e: Expense) {
    if (!window.confirm(`למחוק את ההוצאה "${e.description}"? אי אפשר לבטל.`)) return;
    try {
      await sendJson(`/api/admin/expenses/${e.id}`, "DELETE");
      toast({ title: "ההוצאה נמחקה", variant: "success" });
      await reload();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "המחיקה נכשלה", variant: "error" });
    }
  }

  const list = (items: Expense[]) => (
    <ul className="divide-y">
      {items.map((e) => (
        <ExpenseItem key={e.id} e={e} onEdit={() => setDialog({ open: true, editing: e })} onDelete={() => void remove(e)} />
      ))}
    </ul>
  );

  return (
    <div>
      <StaffPageHeader
        title={T.expenses}
        description="הוצאות כלליות של העסק: פרסום, דלק, אריזות, שכירות ועוד. השכר מנוהל בעמוד שכר."
        actions={
          <Button onClick={() => setDialog({ open: true, editing: null })} size="lg">
            <Plus className="h-4 w-4" />
            הוצאה חדשה
          </Button>
        }
      />

      {error && !data && <ErrorState message={error} onRetry={() => void reload()} />}
      {loading && !data && <LoadingState />}

      {data && (
        <div className="space-y-4">
          <ExpensesSummaryCard
            data={summary.data}
            error={summary.error}
            loading={summary.loading}
            onRetry={() => void reloadSummary()}
          />
          {expenses.length === 0 ? (
            <EmptyState title="עוד אין הוצאות" hint="לחצו על ״הוצאה חדשה״ כדי להוסיף." />
          ) : (
            <>
              <Card title="הוצאות קבועות (כל שבוע)">
                {recurring.length ? list(recurring) : <p className="text-sm text-muted-foreground">אין הוצאות קבועות</p>}
              </Card>
              <Card title="הוצאות חד-פעמיות">
                {oneTime.length ? list(oneTime) : <p className="text-sm text-muted-foreground">אין הוצאות חד-פעמיות</p>}
              </Card>
            </>
          )}
        </div>
      )}

      <ExpenseFormDialog
        open={dialog.open}
        editing={dialog.editing}
        onClose={() => setDialog({ open: false, editing: null })}
        onSubmit={submit}
      />
    </div>
  );
}
