"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const AUTH_KEY = "flowers-admin-auth";

export function isAdminAuthenticated(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(AUTH_KEY) === "1";
}

export function clearAdminAuth() {
  if (typeof window !== "undefined") sessionStorage.removeItem(AUTH_KEY);
}

export default function AdminGate() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pin.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pin.trim() }),
      });
      if (!res.ok) {
        const t = await res.json().catch(() => ({}));
        throw new Error(t.error ?? "קוד שגוי");
      }
      sessionStorage.setItem(AUTH_KEY, "1");
      router.replace("/admin/products");
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm"
      >
        <div className="mb-4 flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Lock className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold">כניסת מנהל</h1>
          <p className="text-sm text-muted-foreground">הזינו את קוד הגישה</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="pin">קוד PIN</Label>
          <Input
            id="pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="••••"
            autoFocus
            dir="ltr"
            className="text-center text-lg tracking-widest"
          />
        </div>

        {error && (
          <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <Button
          type="submit"
          className="mt-4 w-full"
          disabled={!pin.trim() || submitting}
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              בודק…
            </>
          ) : (
            "כניסה"
          )}
        </Button>
      </form>
    </main>
  );
}