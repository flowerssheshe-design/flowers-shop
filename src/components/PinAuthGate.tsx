"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type PinRole = "ADMIN" | "STALL" | "COURIER";

const ROLE_LABELS: Record<PinRole, string> = {
  ADMIN: "מנהל",
  STALL: "ניהול דוכן",
  COURIER: "שליח",
};

export default function PinAuthGate({
  pinRole,
  children,
}: {
  pinRole: PinRole;
  children: React.ReactNode;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    try {
      const cookieName = `flowers_${pinRole.toLowerCase()}_auth`;
      const docCookie = document.cookie
        .split("; ")
        .find((row) => row.startsWith(`${cookieName}=`));
      const stored = localStorage.getItem(`flowers_${pinRole.toLowerCase()}_auth`);
      if (docCookie || stored === "1") {
        setAuthed(true);
      }
    } catch {
      // ignore
    }
    const handler = () => {
      try {
        const cookieName = `flowers_${pinRole.toLowerCase()}_auth`;
        document.cookie = `${cookieName}=; Path=/; Max-Age=0; SameSite=Lax`;
        localStorage.removeItem(`flowers_${pinRole.toLowerCase()}_auth`);
      } catch {}
      setAuthed(false);
      setPin("");
      setError(null);
    };
    window.addEventListener(`${pinRole.toLowerCase()}:unauth`, handler);
    return () => window.removeEventListener(`${pinRole.toLowerCase()}:unauth`, handler);
  }, [pinRole]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    const trimmed = pin.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/${pinRole.toLowerCase()}/verify-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: trimmed }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "PIN שגוי");
        return;
      }
      setAuthed(true);
      try {
        localStorage.setItem(`flowers_${pinRole.toLowerCase()}_auth`, "1");
      } catch {}
    } catch {
      setError("שגיאת חיבור");
    } finally {
      setLoading(false);
    }
  }

  if (authed) return <>{children}</>;

  return (
    <div className="flex min-h-screen items-center justify-center p-4" dir="rtl">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border bg-white p-6 shadow-sm"
      >
        <h1 className="text-xl font-bold text-center">
          הזן קוד גישה - {ROLE_LABELS[pinRole]}
        </h1>
        <div className="space-y-2">
          <Label htmlFor="pin">קוד PIN</Label>
          <Input
            id="pin"
            type="tel"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="****"
            required
            autoFocus
            className="text-center text-2xl tracking-widest"
          />
        </div>
        {error && (
          <p className="text-sm text-red-600 text-center">{error}</p>
        )}
        <Button type="submit" className="w-full" disabled={loading || !pin.trim()}>
          {loading ? "מאמת..." : "אישור"}
        </Button>
      </form>
    </div>
  );
}
