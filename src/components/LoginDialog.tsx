"use client";

import { useEffect, useState } from "react";
import { Bell, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { CLUB_DISCOUNT_THRESHOLD } from "@/types";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  reason?: string;
  initialMode?: Mode;
  onSuccess?: () => void;
};

type Mode = "login" | "register";

export function LoginDialog({
  open,
  onOpenChange,
  reason,
  initialMode = "login",
  onSuccess,
}: Props) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [optIn, setOptIn] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setError(null);
    }
  }, [open, initialMode]);

  useEffect(() => {
    if (mode === "register") setOptIn(true);
  }, [mode]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const url =
        mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const body: Record<string, unknown> = {
        email: email.trim(),
        password,
      };
      if (mode === "register") {
        body.full_name = fullName.trim();
        body.notification_opt_in = optIn;
      }
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error ?? "שגיאה באימות המשתמש",
        );
      }
      onSuccess?.();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0">
        <DialogHeader>
          <DialogTitle>התחברות / הרשמה</DialogTitle>
        </DialogHeader>

        <div className="p-4 pt-0">
          {reason && (
            <p className="mb-3 rounded-md border border-primary/15 bg-cream/60 p-2 text-xs text-foreground/80">
              {reason}
            </p>
          )}

          <div className="mb-4 grid grid-cols-2 rounded-full border border-primary/15 bg-muted/50 p-1 text-sm">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={cn(
                "rounded-full px-3 py-1.5 transition",
                mode === "login"
                  ? "bg-primary text-primary-foreground shadow"
                  : "text-foreground/70",
              )}
            >
              התחברות
            </button>
            <button
              type="button"
              onClick={() => setMode("register")}
              className={cn(
                "rounded-full px-3 py-1.5 transition",
                mode === "register"
                  ? "bg-primary text-primary-foreground shadow"
                  : "text-foreground/70",
              )}
            >
              הרשמה
            </button>
          </div>

          <form onSubmit={submit} className="space-y-3">
            {mode === "register" && (
              <div className="space-y-1.5">
                <Label htmlFor="reg-name">שם מלא</Label>
                <Input
                  id="reg-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="ישראל ישראלי"
                  autoComplete="name"
                  required
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="auth-email">אימייל</Label>
              <Input
                id="auth-email"
                type="email"
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="auth-pass">סיסמה</Label>
              <Input
                id="auth-pass"
                type="password"
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="לפחות 6 תווים"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                minLength={6}
                required
              />
            </div>

            {mode === "register" && (
              <label
                htmlFor="opt-in"
                className="flex cursor-pointer items-start gap-2 rounded-lg border border-primary/15 bg-cream/40 p-3 text-sm"
              >
                <Checkbox
                  id="opt-in"
                  checked={optIn}
                  onCheckedChange={(v) => setOptIn(Boolean(v))}
                  className="mt-0.5"
                />
                <span className="flex-1 leading-snug">
                  <span className="flex items-center gap-1 font-medium">
                    <Bell className="h-3.5 w-3.5 text-primary" />
                    אישור קבלת הודעות ועדכונים
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    מאשר/ת קבלת הודעות על סטטוס הזמנה, זרים חדשים, מבצעים ועדכונים
                    לשבת קודש. ניתן להסיר בכל עת מהגדרות החשבון.
                  </span>
                </span>
              </label>
            )}

            {error && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <Button
              type="submit"
              size="lg"
              className="w-full rounded-full"
              disabled={submitting}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : mode === "login" ? (
                "התחבר"
              ) : (
                "צור חשבון"
              )}
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              {mode === "login"
                ? "אין לכם חשבון? עברו להרשמה וקבלו מעקב הזמנות והנחת קונה קבוע אחרי {CLUB_DISCOUNT_THRESHOLD} הזמנות."
                : "בהרשמה תקבלו גישה לפרטי החשבון ומעקב הזמנות."}
            </p>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}