"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, MessageSquare, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toaster";
import { StaffPageHeader, type ShellEmployee } from "@/components/staff/StaffShell";
import { canManageTeam } from "@/lib/staff/access";
import { T } from "@/lib/staff/labels";
import { cn } from "@/lib/utils";
import { opsFetch } from "@/lib/staff/ops/client";
import { TASK_GROUP_LABELS, type Task, type TaskGroup } from "@/lib/staff/ops/tasks";
import type { StaffRequestView, StaffRequestsResponse } from "@/lib/staff/requests";
import { ErrorBlock, LoadingBlock, useOpsData } from "./common";

const GROUPS: TaskGroup[] = ["owner", "ops", "orders"];

function when(iso: string) {
  return new Date(iso).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** "משימות": what is still open this week, each with a "לבצע" button to the right page. */
export function TasksView({ me }: { me: ShellEmployee }) {
  const { data, error, loading, reload } = useOpsData<{ tasks: Task[] }>("/api/staff/tasks", (u) => opsFetch(u));
  const owner = canManageTeam(me);
  const tasks = data?.tasks ?? [];

  return (
    <div className="space-y-4">
      <StaffPageHeader title="משימות" description="מה עוד צריך לעשות השבוע. כשמשהו נעשה, הוא נעלם מכאן לבד." />

      {loading && !data ? (
        <LoadingBlock />
      ) : error && !data ? (
        <ErrorBlock message={error} onRetry={reload} />
      ) : tasks.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border bg-background p-4 text-primary">
          <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
          <span className="font-medium">אין משימות פתוחות. הכל מסודר!</span>
        </div>
      ) : (
        GROUPS.map((g) => {
          const list = tasks.filter((t) => t.group === g);
          if (list.length === 0) return null;
          return (
            <section key={g} className="rounded-lg border bg-background p-4">
              <h2 className="mb-3 font-semibold">{TASK_GROUP_LABELS[g]}</h2>
              <ul className="space-y-2">
                {list.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{t.title}</p>
                      {t.detail && <p className="mt-0.5 text-sm text-muted-foreground">{t.detail}</p>}
                    </div>
                    <Button asChild className="h-11 shrink-0">
                      <Link href={t.href}>
                        לבצע
                        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}

      {owner && <StaffRequests />}
    </div>
  );
}

/** "פניות עובדים": requests from employees to the owners. */
function StaffRequests() {
  const { data, error, loading, reload } = useOpsData<StaffRequestsResponse>("/api/staff/requests", (u) => opsFetch(u));
  const [showDone, setShowDone] = React.useState(false);
  if (loading && !data) return <LoadingBlock />;
  if (error && !data) return <ErrorBlock message={error} onRetry={reload} />;
  if (!data) return null;

  const open = data.requests.filter((r) => !r.resolved_at);
  const done = data.requests.filter((r) => r.resolved_at);

  return (
    <section className="rounded-lg border bg-background p-4">
      <h2 className="mb-1 flex items-center gap-2 font-semibold">
        <MessageSquare className="h-5 w-5 text-primary" aria-hidden="true" />
        פניות עובדים {open.length > 0 && <span className="rounded-full bg-primary px-2 text-xs text-primary-foreground">{open.length}</span>}
      </h2>
      {!data.ready ? (
        <p className="text-sm text-amber-800">כדי לקבל פניות צריך להריץ את מיגרציה 046.</p>
      ) : open.length === 0 ? (
        <p className="text-sm text-muted-foreground">אין פניות פתוחות.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {open.map((r) => (
            <RequestItem key={r.id} r={r} onChanged={reload} />
          ))}
        </ul>
      )}
      {done.length > 0 && (
        <div className="mt-3">
          <button type="button" className="text-sm text-muted-foreground underline" onClick={() => setShowDone((v) => !v)}>
            {showDone ? "הסתרת פניות שטופלו" : `פניות שטופלו (${done.length})`}
          </button>
          {showDone && (
            <ul className="mt-2 space-y-2">
              {done.map((r) => (
                <RequestItem key={r.id} r={r} onChanged={reload} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function RequestItem({ r, onChanged }: { r: StaffRequestView; onChanged: () => void }) {
  const { toast } = useToast();
  const [reply, setReply] = React.useState("");
  const [replying, setReplying] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const handled = Boolean(r.resolved_at);

  async function remove() {
    if (!window.confirm("למחוק את הפנייה? אי אפשר לבטל.")) return;
    setBusy(true);
    try {
      await opsFetch(`/api/staff/requests/${r.id}`, { method: "DELETE" });
      toast({ title: "הפנייה נמחקה", variant: "success" });
      onChanged();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : T.saveError, variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function setResolved(resolved: boolean) {
    setBusy(true);
    try {
      await opsFetch(`/api/staff/requests/${r.id}`, { method: "PATCH", body: { resolved, reply: reply.trim() || undefined } });
      toast({ title: resolved ? "סומן כטופל" : "הפנייה נפתחה שוב", variant: "success" });
      onChanged();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : T.saveError, variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={cn("rounded-md border p-3", handled && "bg-muted/30")}>
      <p className="text-sm font-medium">
        {r.employee_name} <span className="font-normal text-muted-foreground">· {when(r.created_at)}</span>
      </p>
      <p className="mt-1 whitespace-pre-wrap text-sm">{r.body}</p>
      {r.reply && <p className="mt-1 rounded bg-primary/5 p-2 text-sm">התשובה שלך: {r.reply}</p>}
      {handled ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={() => void setResolved(false)} disabled={busy}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            לפתוח שוב
          </Button>
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => void remove()} disabled={busy}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            מחיקה
          </Button>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          {replying && (
            <Textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} placeholder="תשובה לעובד (לא חובה)" aria-label="תשובה" />
          )}
          <div className="flex flex-wrap gap-2">
            <Button className="h-11" onClick={() => void setResolved(true)} disabled={busy}>
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              טופל
            </Button>
            {!replying && (
              <Button variant="outline" className="h-11" onClick={() => setReplying(true)}>
                להוסיף תשובה
              </Button>
            )}
            <Button variant="ghost" className="h-11 text-destructive hover:text-destructive" onClick={() => void remove()} disabled={busy}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              מחיקה
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
