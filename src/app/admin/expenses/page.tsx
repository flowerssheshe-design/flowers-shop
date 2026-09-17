"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ExternalLink,
  Loader2,
  LogOut,
  Plus,
  Trash2,
  Menu,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  clearAdminAuth,
  isAdminAuthenticated,
} from "@/components/AdminGate";
import { AdminNav } from "@/components/AdminNav";
import { formatILS } from "@/lib/utils";
import type { Expense, ExpensesSummary } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export default function AdminExpensesPage() {
  const [ready, setReady] = useState(false);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expensesSummary, setExpensesSummary] = useState<ExpensesSummary>({
    total_one_time: 0,
    total_recurring: 0,
    total_all: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showExpenseDialog, setShowExpenseDialog] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [expenseForm, setExpenseForm] = useState({
    description: "",
    amount: "",
    category: "",
    expense_type: "one_time" as "one_time" | "recurring",
  });
  const [expenseFormError, setExpenseFormError] = useState<string | null>(null);
  const [submittingExpense, setSubmittingExpense] = useState(false);

  useEffect(() => {
    if (!isAdminAuthenticated()) {
      window.location.replace("/admin");
      return;
    }
    setReady(true);
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/expenses", { cache: "no-store" });
      if (!res.ok) throw new Error("טעינת נתונים נכשלה");
      const data = await res.json();
      setExpenses(data.expenses || []);
      if (data.expensesSummary) {
        setExpensesSummary(data.expensesSummary);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    clearAdminAuth();
    window.location.replace("/admin");
  }

  function openAddExpense() {
    setEditingExpense(null);
    setExpenseForm({ description: "", amount: "", category: "", expense_type: "one_time" });
    setExpenseFormError(null);
    setShowExpenseDialog(true);
  }

  function openEditExpense(expense: Expense) {
    setEditingExpense(expense);
    setExpenseForm({
      description: expense.description,
      amount: String(expense.amount),
      category: expense.category,
      expense_type: expense.expense_type,
    });
    setExpenseFormError(null);
    setShowExpenseDialog(true);
  }

  function closeExpenseDialog() {
    setShowExpenseDialog(false);
    setEditingExpense(null);
    setExpenseForm({ description: "", amount: "", category: "", expense_type: "one_time" });
    setExpenseFormError(null);
  }

  async function submitExpense(e: React.FormEvent) {
    e.preventDefault();
    setExpenseFormError(null);
    const { description, amount, category, expense_type } = expenseForm;
    if (!description.trim() || !amount || !category.trim()) {
      setExpenseFormError("יש למלא את כל השדות");
      return;
    }
    const amt = Number(amount);
    if (isNaN(amt) || amt < 0) {
      setExpenseFormError("סכום לא תקין");
      return;
    }
    setSubmittingExpense(true);
    try {
      const url = editingExpense
        ? `/api/admin/expenses/${editingExpense.id}`
        : "/api/admin/expenses";
      const method = editingExpense ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, amount: amt, category, expense_type }),
      });
      if (!res.ok) throw new Error(editingExpense ? "עדכון נכשל" : "הוספה נכשלה");
      await load();
      closeExpenseDialog();
    } catch (e) {
      setExpenseFormError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setSubmittingExpense(false);
    }
  }

  async function deleteExpense(id: string) {
    if (!confirm("למחוק את ההוצאה הזו?")) return;
    try {
      const res = await fetch(`/api/admin/expenses/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("מחיקה נכשלה");
      setExpenses((prev) => prev.filter((ex) => ex.id !== id));
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "שגיאה");
    }
  }

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </main>
    );
  }

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
            <Button size="sm" variant="ghost" onClick={logout}>
              <LogOut className="h-4 w-4" />
              יציאה
            </Button>
          </div>
        </div>
      </header>

      <div className="container space-y-6 py-6">
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="ghost">
              <Link href="/admin/stats">
                <ArrowLeft className="h-4 w-4" />
                חזרה לסטטיסטיקות
              </Link>
            </Button>
            <h1 className="text-2xl font-bold">ניהול הוצאות עסקיות</h1>
          </div>
          <Dialog open={showExpenseDialog} onOpenChange={setShowExpenseDialog}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-primary hover:bg-primary/90">
                <Plus className="h-4 w-4 ml-1.5" />
                הוסף הוצאה
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md overflow-visible">
              <DialogHeader>
                <DialogTitle>{editingExpense ? "עריכת הוצאה" : "הוספת הוצאה חדשה"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={submitExpense} className="space-y-4">
                {expenseFormError && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                    {expenseFormError}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="description">תיאור</Label>
                  <Input
                    id="description"
                    value={expenseForm.description}
                    onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                    placeholder="למשל: פרסום שבועי, דלק, ציוד"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amount">סכום (₪)</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={expenseForm.amount}
                    onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category">קטגוריה</Label>
                  <Select
                    value={expenseForm.category}
                    onValueChange={(v) => setExpenseForm({ ...expenseForm, category: v })}
                  >
                    <SelectTrigger id="category">
                      <SelectValue placeholder="בחר קטגוריה" />
                    </SelectTrigger>
                    <SelectContent className="z-[999] bg-popover">
                      <SelectItem value="advertising">פרסום ושיווק</SelectItem>
                      <SelectItem value="fuel">דלק והובלה</SelectItem>
                      <SelectItem value="equipment">ציוד וחומרים</SelectItem>
                      <SelectItem value="packaging">אריזות</SelectItem>
                      <SelectItem value="rent">שכירות</SelectItem>
                      <SelectItem value="utilities">חשמל/מים/אינטרנט</SelectItem>
                      <SelectItem value="salaries">משכורות</SelectItem>
                      <SelectItem value="other">אחר</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expense_type">סוג הוצאה</Label>
                  <Select
                    value={expenseForm.expense_type}
                    onValueChange={(v) => setExpenseForm({ ...expenseForm, expense_type: v as "one_time" | "recurring" })}
                  >
                    <SelectTrigger id="expense_type">
                      <SelectValue placeholder="בחר סוג" />
                    </SelectTrigger>
                    <SelectContent className="z-[999] bg-popover">
                      <SelectItem value="one_time">חד-פעמית</SelectItem>
                      <SelectItem value="recurring">קבועה/חוזרת</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={closeExpenseDialog} disabled={submittingExpense}>
                    ביטול
                  </Button>
                  <Button type="submit" disabled={submittingExpense}>
                    {submittingExpense ? <Loader2 className="h-4 w-4 animate-spin" /> : editingExpense ? "עדכון" : "הוסף"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <>
            {expenses.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                אין הוצאות רשומות. לחץ על &quot;הוסף הוצאה&quot; כדי להתחיל.
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {expenses.map((expense) => (
                  <ExpenseRow
                    key={expense.id}
                    expense={expense}
                    onEdit={openEditExpense}
                    onDelete={deleteExpense}
                  />
                ))}
                <div className="border-t pt-3 flex justify-between text-sm font-medium">
                  <span>סה״כ חד-פעמי</span>
                  <span>{formatILS(expensesSummary.total_one_time || 0)}</span>
                </div>
                <div className="flex justify-between text-sm font-medium">
                  <span>סה״כ קבוע/חוזר</span>
                  <span>{formatILS(expensesSummary.total_recurring || 0)}</span>
                </div>
                <div className="border-t pt-3 flex justify-between text-sm font-bold text-lg">
                  <span>סה״כ הוצאות</span>
                  <span>{formatILS(expensesSummary.total_all || 0)}</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function ExpenseRow({
  expense,
  onEdit,
  onDelete,
}: {
  expense: Expense;
  onEdit: (e: Expense) => void;
  onDelete: (id: string) => void;
}) {
  const isRecurring = expense.expense_type === "recurring";
  return (
    <div className="flex items-center justify-between gap-2 p-3 rounded-lg border bg-muted/30">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{expense.description}</span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              isRecurring ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
            }`}
          >
            {isRecurring ? "קבועה" : "חד-פעמית"}
          </span>
          <span className="text-xs text-muted-foreground">{expense.category}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {new Date(expense.created_at).toLocaleDateString("he-IL")}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className="tabular-nums font-bold text-rose-600 whitespace-nowrap">
          -{formatILS(expense.amount || 0)}
        </span>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => onEdit(expense)}
          className="text-muted-foreground hover:text-primary"
        >
          <Menu className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => onDelete(expense.id)}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
