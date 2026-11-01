"use client";

import { useStaffRefresh } from "@/lib/staff/refresh";
import { useCallback, useEffect, useState } from "react";
import { Bell, Megaphone, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toaster";
import { T } from "@/lib/staff/labels";
import { ML } from "@/lib/staff/marketing/labels";
import { Card, ErrorState, Loading, Notice, StatCard, api, formatDateTime } from "./ui";

type Status = { configured: boolean; subscribers: number; lastSentAt: string | null };

export function PushCenter({ configured }: { configured: boolean }) {
  return (
    <div className="space-y-6">
      {!configured && (
        <Notice title={ML.pushNotConfiguredTitle}>
          <ol className="mt-2 list-decimal space-y-1 pr-5">
            {ML.pushNotConfiguredSteps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </Notice>
      )}
      <PushSection configured={configured} />
      <BannerSection />
    </div>
  );
}

function PushSection({ configured }: { configured: boolean }) {
  const { toast } = useToast();
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("/");
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setStatus(await api<Status>("/api/staff/marketing/push"));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useStaffRefresh(load);

  const send = async () => {
    setSending(true);
    try {
      const r = await api<{ sent: number; failed: number; removed: number; total: number }>(
        "/api/staff/marketing/push",
        { method: "POST", json: { title, body, url, confirm: true } },
      );
      toast({
        title: `ההתראה נשלחה ל-${r.sent} מכשירים`,
        description: r.removed ? `${r.removed} מנויים שכבר לא פעילים הוסרו.` : undefined,
        variant: "success",
      });
      setTitle("");
      setBody("");
      setUrl("/");
      void load();
    } catch (e) {
      toast({ title: (e as Error).message, variant: "error" });
    } finally {
      setSending(false);
      setConfirming(false);
    }
  };

  const valid = title.trim().length >= 2 && body.trim().length >= 2 && url.trim().startsWith("/");

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        <Bell className="h-5 w-5 text-primary" aria-hidden="true" />
        <h2 className="text-lg font-bold">התראה לטלפון</h2>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !status ? (
        <Loading />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="מכשירים שאישרו התראות" value={status.subscribers} />
          <StatCard label="נשלחה לאחרונה" value={status.lastSentAt ? formatDateTime(status.lastSentAt) : "—"} />
        </div>
      )}

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) setConfirming(true);
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="push-title">כותרת</Label>
          <Input
            id="push-title"
            className="h-11"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={60}
            placeholder="הדוכן פתוח עכשיו!"
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="push-body">טקסט</Label>
          <Textarea
            id="push-body"
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={180}
            placeholder="זרים טריים לשבת בכיכר, עד 14:00"
            required
          />
          <p className="text-xs text-muted-foreground">{body.length}/180</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="push-url">לאן ללחיצה תוביל</Label>
          <Input
            id="push-url"
            dir="ltr"
            className="h-11 text-left"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="/"
          />
          <p className="text-xs text-muted-foreground">דף באתר, למשל / לדף הבית.</p>
        </div>
        <Button type="submit" className="min-h-11 w-full sm:w-auto" disabled={!configured || !valid || !status?.subscribers}>
          <Send className="h-4 w-4" aria-hidden="true" /> שליחה לכולם
        </Button>
        {configured && status && status.subscribers === 0 && (
          <p className="text-xs text-muted-foreground">עוד אף אחד לא אישר התראות. החלונית באתר מציעה ללקוחות להצטרף.</p>
        )}
      </form>

      <Dialog open={confirming} onOpenChange={(o) => !o && !sending && setConfirming(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>לשלוח ל-{status?.subscribers ?? 0} מכשירים?</DialogTitle>
          </DialogHeader>
          <div className="rounded-lg border bg-muted p-3 text-sm">
            <p className="font-bold">{title}</p>
            <p>{body}</p>
          </div>
          <p className="text-sm text-muted-foreground">אי אפשר לבטל התראה אחרי שנשלחה.</p>
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

function BannerSection() {
  const { toast } = useToast();
  const [text, setText] = useState<string | null>(null);
  const [saved, setSaved] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const d = await api<{ text: string }>("/api/staff/marketing/banner");
      setText(d.text);
      setSaved(d.text);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useStaffRefresh(load);

  const save = async (value: string) => {
    setSaving(true);
    try {
      const d = await api<{ text: string }>("/api/staff/marketing/banner", { method: "PUT", json: { text: value } });
      setText(d.text);
      setSaved(d.text);
      toast({ title: d.text ? "הבאנר עודכן" : "הבאנר הוסר מהאתר", variant: "success" });
    } catch (e) {
      toast({ title: (e as Error).message, variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        <Megaphone className="h-5 w-5 text-primary" aria-hidden="true" />
        <h2 className="text-lg font-bold">באנר באתר</h2>
      </div>
      <p className="text-sm text-muted-foreground">הודעה קצרה שמופיעה ללקוחות בחנות. השאירו ריק כדי להסתיר.</p>
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : text === null ? (
        <Loading />
      ) : (
        <>
          <div className="space-y-1">
            <Label htmlFor="banner">טקסט הבאנר</Label>
            <Textarea id="banner" rows={2} value={text} onChange={(e) => setText(e.target.value)} maxLength={200} />
            <p className="text-xs text-muted-foreground">{text.length}/200</p>
          </div>
          {text.trim() && (
            <div className="rounded-lg bg-[#5c6846] px-4 py-3 text-center font-bold text-white">{text}</div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button className="min-h-11" disabled={saving || text.trim() === saved} onClick={() => save(text)}>
              {saving ? T.saving : T.save}
            </Button>
            {saved && (
              <Button variant="outline" className="min-h-11" disabled={saving} onClick={() => save("")}>
                הסרת הבאנר
              </Button>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
