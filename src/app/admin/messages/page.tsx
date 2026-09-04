"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ExternalLink,
  Loader2,
  LogOut,
  Search,
  Send,
  Smartphone,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { clearAdminAuth, isAdminAuthenticated } from "@/components/AdminGate";
import { AdminNav } from "@/components/AdminNav";
import { normalizeWhatsAppRecipient } from "@/lib/utils";
import type { BroadcastRecipientResult } from "@/lib/whatsapp";
import { WHATSAPP_MAX_TEXT_LENGTH } from "@/lib/constants";
import type { AdminUser } from "@/types";

type TargetMode = "all" | "selected";

export default function AdminMessagesPage() {
  const [ready, setReady] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [eligible, setEligible] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [targetMode, setTargetMode] = useState<TargetMode>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [results, setResults] = useState<BroadcastRecipientResult[] | null>(
    null,
  );

  useEffect(() => {
    if (!isAdminAuthenticated()) {
      window.location.replace("/admin");
      return;
    }
    setReady(true);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      if (!res.ok) throw new Error("טעינת משתמשים נכשלה");
      const data = (await res.json()) as { users: AdminUser[] };
      const list = data.users ?? [];
      setUsers(list);
      setEligible(
        list.filter(
          (u) =>
            u.notification_opt_in !== false &&
            normalizeWhatsAppRecipient(u.phone) !== null,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setLoading(false);
    }
  }

  const pickerFiltered = useMemo(() => {
    if (!search.trim()) return eligible;
    const term = search.trim().toLowerCase();
    return eligible.filter(
      (u) =>
        u.email?.toLowerCase().includes(term) ||
        u.full_name?.toLowerCase().includes(term) ||
        u.phone?.includes(term),
    );
  }, [eligible, search]);

  const recipientCount =
    targetMode === "all" ? eligible.length : selectedIds.size;

  function toggleSelect(id: string, checked: boolean) {
    const next = new Set(selectedIds);
    if (checked) next.add(id);
    else next.delete(id);
    setSelectedIds(next);
  }

  function selectAllFiltered(checked: boolean) {
    if (checked) {
      const next = new Set(selectedIds);
      pickerFiltered.forEach((u) => next.add(u.id));
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      pickerFiltered.forEach((u) => next.delete(u.id));
      setSelectedIds(next);
    }
  }

  async function send() {
    if (sending) return;
    const ids =
      targetMode === "selected" ? Array.from(selectedIds) : undefined;

    setSendError(null);
    setResults(null);
    setSending(true);
    try {
      const res = await fetch("/api/admin/whatsapp/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          recipients: targetMode,
          userIds: ids,
        }),
      });
      if (!res.ok) {
        const t = await res.json().catch(() => ({}));
        throw new Error((t as { error?: string }).error ?? "שליחה נכשלה");
      }
      const data = (await res.json()) as {
        sent: number;
        failed: number;
        skipped: number;
        total: number;
        results: BroadcastRecipientResult[];
      };
      setResults(data.results);
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setSending(false);
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

  const sendDisabled = sending || message.trim().length === 0 || recipientCount === 0;

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

      <div className="container space-y-5 py-4">
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <h1 className="text-xl font-bold">הודעות וואצפ</h1>

        <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
          {/* Message */}
          <div className="space-y-1.5">
            <Label htmlFor="wa-message">הודעה</Label>
            <Textarea
              id="wa-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="הקלד את ההודעה שתשלחו למשתמשים..."
              maxLength={WHATSAPP_MAX_TEXT_LENGTH}
              rows={4}
            />
            <div className="flex justify-end text-xs text-muted-foreground">
              {message.length}/{WHATSAPP_MAX_TEXT_LENGTH}
            </div>
          </div>

          {/* Target mode */}
          <div className="space-y-2">
            <Label className="text-sm">קהל יעד</Label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setTargetMode("all");
                  setSelectedIds(new Set());
                }}
                className={`flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition ${
                  targetMode === "all"
                    ? "border-primary bg-primary text-primary-foreground shadow"
                    : "border-muted bg-background hover:bg-accent"
                }`}
              >
                <Smartphone className="h-4 w-4" />
                כל המשתמשים הרשומים (היום אליהם)
              </button>
              <button
                type="button"
                onClick={() => setTargetMode("selected")}
                className={`flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition ${
                  targetMode === "selected"
                    ? "border-primary bg-primary text-primary-foreground shadow"
                    : "border-muted bg-background hover:bg-accent"
                }`}
              >
                <Send className="h-4 w-4" />
                בחירת משתמשים
              </button>
            </div>
          </div>

          {/* Selected users picker */}
          {targetMode === "selected" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  נבחרו <strong>{selectedIds.size}</strong> משתמשים
                </div>
                <div className="relative w-full max-w-sm">
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
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : pickerFiltered.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  אין משתמשים זמינים לבחירה. למשתמשים ללא טלפון או שביטלו
                  עדכונים לא מוצגים כאן.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border bg-background">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-start text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="p-2">בחירה</th>
                        <th className="p-2">שם מלא</th>
                        <th className="p-2">טלפון</th>
                        <th className="p-2">אימייל</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pickerFiltered.map((u) => (
                        <tr key={u.id} className="border-t align-top">
                          <td className="p-2">
                            <Checkbox
                              checked={selectedIds.has(u.id)}
                              onCheckedChange={(c) =>
                                toggleSelect(u.id, Boolean(c))
                              }
                              aria-label={`בחר ${u.full_name ?? u.email}`}
                            />
                          </td>
                          <td className="p-2">
                            <div className="font-medium">
                              {u.full_name || "—"}
                            </div>
                          </td>
                          <td className="p-2 font-mono text-xs" dir="ltr">
                            {u.phone || "—"}
                          </td>
                          <td className="p-2" dir="ltr">
                            {u.email || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => selectAllFiltered(true)}
                >
                  בחר הכל
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedIds(new Set())}
                >
                  <X className="h-3.5 w-3.5" />
                  נקה בחירה
                </Button>
              </div>
            </div>
          )}

          {/* Preview + send */}
          <div className="flex flex-col gap-3 border-t pt-3">
            <div className="text-sm text-muted-foreground">
              {recipientCount > 0
                ? `עומד לשלוח לכ-${recipientCount} משתמשים`
                : "אין משתמשים זמינים לשליחה"}
            </div>
            {sendError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
                {sendError}
              </div>
            )}
            <Button className="w-full" disabled={sendDisabled} onClick={send}>
              {sending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  שולח...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  שלח הודעה
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Results */}
        {results && (
          <ResultsCard
            results={results}
            onDismiss={() => setResults(null)}
          />
        )}
      </div>
    </main>
  );
}

type ResultsCardProps = {
  results: BroadcastRecipientResult[];
  onDismiss: () => void;
};

function ResultsCard({ results, onDismiss }: ResultsCardProps) {
  const sent = results.filter((r) => r.status === "sent").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const skipped = results.filter((r) => r.status === "skipped").length;

  const problemRows = results.filter(
    (r) => r.status === "failed" || r.status === "skipped",
  );

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">תוצאות שליחה</h2>
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="flex gap-4 text-center text-sm">
        <div>
          <div className="text-2xl font-bold text-emerald-600">{sent}</div>
          <div className="text-xs text-muted-foreground">נשלח</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-destructive">{failed}</div>
          <div className="text-xs text-muted-foreground">נכשל</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-muted-foreground">
            {skipped}
          </div>
          <div className="text-xs text-muted-foreground">דלג</div>
        </div>
      </div>

      {problemRows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-start text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-2 text-start">שם</th>
                <th className="p-2" dir="ltr">
                  טלפון
                </th>
                <th className="p-2">סטטוס</th>
                <th className="p-2">הסבר</th>
              </tr>
            </thead>
            <tbody>
              {problemRows.map((r) => (
                <tr key={r.user_id} className="border-t align-top">
                  <td className="p-2">
                    {r.name || (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-2 font-mono text-xs" dir="ltr">
                    {r.phone || "—"}
                  </td>
                  <td className="p-2">
                    <span
                      className={
                        r.status === "failed"
                          ? "text-destructive"
                          : "text-muted-foreground"
                      }
                    >
                      {r.status === "failed" ? "נכשל" : "דלג"}
                    </span>
                  </td>
                  <td className="p-2 max-w-[14rem]">
                    <div
                      className="truncate text-xs text-muted-foreground"
                      title={r.error ?? ""}
                    >
                      {r.error || "—"}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
