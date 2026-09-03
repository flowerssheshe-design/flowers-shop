"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ExternalLink,
  Loader2,
  LogOut,
  Pencil,
  Save,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  clearAdminAuth,
  isAdminAuthenticated,
} from "@/components/AdminGate";
import { AdminNav } from "@/components/AdminNav";
import { formatILS } from "@/lib/utils";
import { CLUB_DISCOUNT_THRESHOLD } from "@/lib/constants";
import type { AdminUser } from "@/types";

export default function AdminUsersPage() {
  const [ready, setReady] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [filtered, setFiltered] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!isAdminAuthenticated()) {
      window.location.replace("/admin");
      return;
    }
    setReady(true);
    void load();
  }, []);

  useEffect(() => {
    if (!search.trim()) {
      setFiltered(users);
      return;
    }
    const term = search.trim().toLowerCase();
    setFiltered(
      users.filter(
        (u) =>
          u.email?.toLowerCase().includes(term) ||
          u.full_name?.toLowerCase().includes(term) ||
          u.phone?.includes(term),
      ),
    );
  }, [users, search]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      if (!res.ok) throw new Error("טעינת משתמשים נכשלה");
      const data = (await res.json()) as { users: AdminUser[] };
      setUsers(data.users ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setLoading(false);
    }
  }

  async function saveEdit(u: AdminUser, fields: { full_name: string; phone: string; address: string }) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) throw new Error("שמירה נכשלה");
      setUsers((prev) =>
        prev.map((x) => (x.id === u.id ? { ...x, ...fields } : x)),
      );
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${confirmDelete.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("מחיקה נכשלה");
      setUsers((prev) => prev.filter((u) => u.id !== confirmDelete.id));
      setConfirmDelete(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setDeleting(false);
    }
  }

  function logout() {
    clearAdminAuth();
    window.location.replace("/admin");
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
        <div className="container flex items-center justify-between gap-2 py-3">
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

      <div className="container space-y-4 py-4">
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl font-bold">משתמשים</h1>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="חיפוש לפי שם/אימייל/טלפון..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 text-sm"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-10">
            אין משתמשים רשומים.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-start text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3 text-start">שם מלא</th>
                  <th className="p-3 text-start">אימייל</th>
                  <th className="p-3 text-start">טלפון</th>
                  <th className="p-3 text-start">כתובת</th>
                  <th className="p-3 text-start">סטטוס לקוח</th>
                  <th className="p-3 text-start">הזמנות</th>
                  <th className="p-3 text-start">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => {
                  const isMember =
                    (u.completed_count ?? 0) >= CLUB_DISCOUNT_THRESHOLD;
                  return (
                    <tr key={u.id} className="border-t align-top">
                      <td className="p-3">
                        <div className="font-medium">
                          {u.full_name || "—"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {u.created_at
                            ? new Date(u.created_at).toLocaleDateString("he-IL")
                            : "—"}
                        </div>
                      </td>
                      <td className="p-3" dir="ltr">
                        {u.email || "—"}
                      </td>
                      <td className="p-3" dir="ltr">
                        {u.phone || "—"}
                      </td>
                      <td className="p-3 max-w-[14rem]">
                        <div className="truncate" title={u.address ?? ""}>
                          {u.address || "—"}
                        </div>
                      </td>
                      <td className="p-3">
                        {isMember ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-xs font-medium text-gold-foreground">
                            <Sparkles className="h-3 w-3 text-gold" />
                            לקוח קבוע
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-muted bg-muted/30 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                            רגיל
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="font-medium tabular-nums">
                          {u.order_count} הזמנות
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {u.completed_count} הושלמו
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label="עריכה"
                            title="עריכה"
                            onClick={() => setEditing(u)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label="מחיקה"
                            title="מחיקה"
                            onClick={() => setConfirmDelete(u)}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="text-center text-xs text-muted-foreground">
          {filtered.length} משתמשים (מתוך {users.length} סה״כ)
        </div>
      </div>

      {/* Edit dialog */}
      {editing && (
        <EditUserDialog
          user={editing}
          saving={saving}
          onClose={() => setEditing(null)}
          onSave={saveEdit}
        />
      )}

      {/* Delete confirmation */}
      <Dialog
        open={Boolean(confirmDelete)}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>מחיקת משתמש</DialogTitle>
          </DialogHeader>
          <div className="p-4 text-sm">
            <p>
              למחוק את <strong>{confirmDelete?.full_name ?? confirmDelete?.email}</strong>?
            </p>
            <p className="mt-2 text-muted-foreground">
              הזמנות היסטוריות יישמרו אך ינותקו מהמשתמש ופרטי הקשר יוסרו.
              לא ניתן לבטל פעולה זו.
            </p>
          </div>
          <div className="flex justify-end gap-2 border-t p-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmDelete(null)}
              disabled={deleting}
            >
              ביטול
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={doDelete}
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              מחק
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function EditUserDialog({
  user,
  saving,
  onClose,
  onSave,
}: {
  user: AdminUser;
  saving: boolean;
  onClose: () => void;
  onSave: (
    u: AdminUser,
    fields: { full_name: string; phone: string; address: string },
  ) => void;
}) {
  const [fullName, setFullName] = useState(user.full_name ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [address, setAddress] = useState(user.address ?? "");

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>עריכת משתמש</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="full_name">שם מלא</Label>
            <Input
              id="full_name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">טלפון</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              dir="ltr"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="address">כתובת</Label>
            <Textarea
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={2}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t p-3">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            <X className="h-4 w-4" />
            ביטול
          </Button>
          <Button
            size="sm"
            onClick={() =>
              onSave(user, {
                full_name: fullName.trim(),
                phone: phone.trim(),
                address: address.trim(),
              })
            }
            disabled={saving || fullName.trim().length < 2}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            שמור
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}