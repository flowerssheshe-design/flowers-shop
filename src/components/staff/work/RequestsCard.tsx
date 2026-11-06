"use client";

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toaster";
import { T } from "@/lib/staff/labels";
import { api, useStaffData } from "@/lib/staff/work/client";
import type { StaffRequestsResponse } from "@/lib/staff/requests";
import { Card } from "./common";

function when(iso: string) {
  return new Date(iso).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** "פנייה למנהל": any employee writes to the owners and sees the answer here. */
export function RequestsCard() {
  const { toast } = useToast();
  const { data, reload } = useStaffData<StaffRequestsResponse>("/api/staff/requests");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  if (data?.isOwner) return null;

  async function send() {
    if (text.trim().length < 2) return;
    setBusy(true);
    try {
      await api("/api/staff/requests", { method: "POST", json: { body: text.trim() } });
      setText("");
      toast({ title: "הפנייה נשלחה למנהל", variant: "success" });
      void reload(true);
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : T.saveError, variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  const mine = data?.requests ?? [];
  return (
    <Card title="פנייה למנהל" description="משהו שצריך לטפל בו, בקשה או שאלה. המנהל הראשי יראה את זה במשימות שלו.">
      <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="מה תרצה לבקש?" aria-label="הפנייה" />
      <Button className="mt-2 h-11" onClick={() => void send()} disabled={busy || text.trim().length < 2}>
        <MessageSquare className="h-4 w-4" aria-hidden="true" />
        {busy ? "שולח…" : "שליחה"}
      </Button>
      {mine.length > 0 && (
        <ul className="mt-4 space-y-2">
          {mine.slice(0, 10).map((r) => (
            <li key={r.id} className="rounded-lg border p-3 text-sm">
              <p className="whitespace-pre-wrap">{r.body}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {when(r.created_at)} · {r.resolved_at ? "טופל" : "ממתין"}
              </p>
              {r.reply && <p className="mt-1 rounded bg-primary/5 p-2 text-sm">תשובת המנהל: {r.reply}</p>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
