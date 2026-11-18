"use client";

import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { urlBase64ToUint8Array } from "@/lib/staff/marketing/push-prompt";
import { api } from "@/lib/staff/work/client";

const VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

type State = "loading" | "on" | "off" | "blocked" | "unsupported" | "ios";

function supported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function iosNotInstalled() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

/**
 * "התראה לטלפון על הזמנה חדשה": on Friday, while the stall is open, a new
 * website order from this stall reaches the seller's phone even when the
 * screen is closed. One tap to turn on (the browser asks for permission).
 */
export function StallPushToggle() {
  const { toast } = useToast();
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        if (!VAPID_KEY || !supported()) return alive && setState(iosNotInstalledSafe() ? "ios" : "unsupported");
        if (Notification.permission === "denied") return alive && setState("blocked");
        const reg = await navigator.serviceWorker.getRegistration("/sw.js");
        const sub = await reg?.pushManager.getSubscription();
        // Granted and subscribed: make sure the server knows this phone belongs to this employee.
        if (sub && Notification.permission === "granted") {
          await api("/api/staff/push", { method: "POST", json: sub.toJSON() }).catch(() => undefined);
          if (alive) setState("on");
        } else if (alive) setState("off");
      } catch {
        if (alive) setState("off");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function turnOn() {
    setBusy(true);
    try {
      const p = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (p !== "granted") {
        setState(p === "denied" ? "blocked" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_KEY) as BufferSource }));
      await api("/api/staff/push", { method: "POST", json: sub.toJSON() });
      setState("on");
      toast({ title: "התראות הופעלו בטלפון הזה", variant: "success" });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "לא הצלחנו להפעיל התראות", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) await api("/api/staff/push", { method: "DELETE", json: { endpoint: sub.endpoint } }).catch(() => undefined);
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading" || state === "unsupported") return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
      <p className="flex min-w-0 items-center gap-2">
        <BellRing className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <span>
          <b>התראה לטלפון על הזמנה חדשה</b>
          <span className="block text-xs text-muted-foreground">
            {state === "on"
              ? "פעיל. בשישי, כשהדוכן פתוח, כל הזמנה חדשה מהדוכן תגיע לטלפון."
              : state === "blocked"
                ? "חסום בדפדפן. כדי להפעיל, מאשרים התראות לאתר בהגדרות הדפדפן."
                : state === "ios"
                  ? "באייפון מקבלים התראות רק מהאתר שבמסך הבית (שיתוף ← הוספה למסך הבית)."
                  : "כבוי. מפעילים כדי לדעת על הזמנה גם כשהמסך סגור."}
          </span>
        </span>
      </p>
      {state === "off" && (
        <Button className="h-11" onClick={() => void turnOn()} disabled={busy}>
          הפעלה
        </Button>
      )}
      {state === "on" && (
        <Button variant="outline" className="h-11" onClick={() => void turnOff()} disabled={busy}>
          כיבוי
        </Button>
      )}
    </div>
  );
}

function iosNotInstalledSafe() {
  try {
    return iosNotInstalled();
  } catch {
    return false;
  }
}
