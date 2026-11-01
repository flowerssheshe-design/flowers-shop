"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Bell, Share, X } from "lucide-react";
import {
  PROMPT_DISMISS_KEY,
  isIosDevice,
  promptMode,
  urlBase64ToUint8Array,
  type PromptMode,
} from "@/lib/staff/marketing/push-prompt";
import { isTrackedPath } from "@/lib/staff/marketing/tracking";

const VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const SHOW_AFTER_MS = 8000;

function readDismissed(): string | null {
  try {
    return localStorage.getItem(PROMPT_DISMISS_KEY);
  } catch {
    return null;
  }
}

function writeDismissed() {
  try {
    localStorage.setItem(PROMPT_DISMISS_KEY, String(Date.now()));
  } catch {
    // private mode: the prompt may show again, that's fine
  }
}

function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

async function subscribe(): Promise<boolean> {
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_KEY) as BufferSource,
    });
  }
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });
  return res.ok;
}

/**
 * A small, polite "turn on notifications" card for customer pages. Never on
 * staff/back-office pages; after "not now" it stays hidden for 30 days. On an
 * iPhone outside the Home Screen app it explains how to add the site instead.
 */
export function PushPrompt() {
  const pathname = usePathname() ?? "/";
  const [mode, setMode] = useState<PromptMode>("hidden");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Keep an existing subscription in sync (e.g. the user logged in since).
  useEffect(() => {
    if (!VAPID_KEY || !isTrackedPath(pathname)) return;
    try {
      if (pushSupported() && Notification.permission === "granted") {
        void subscribe().catch(() => undefined);
      }
    } catch {
      // ignore
    }
    // Only once per page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setMode("hidden");
    const timer = window.setTimeout(() => {
      try {
        setMode(
          promptMode({
            pathname,
            dismissedAt: readDismissed(),
            vapidKey: VAPID_KEY,
            ios: isIosDevice(navigator.userAgent, navigator.maxTouchPoints),
            standalone: isStandalone(),
            pushSupported: pushSupported(),
            permission: "Notification" in window ? Notification.permission : "unsupported",
          }),
        );
      } catch {
        setMode("hidden");
      }
    }, SHOW_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  if (mode === "hidden") return null;

  const dismiss = () => {
    writeDismissed();
    setMode("hidden");
  };

  const accept = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        dismiss();
        return;
      }
      const ok = await subscribe();
      if (ok) {
        setMessage("מעולה! נעדכן אתכם כשיש משהו חדש.");
        writeDismissed();
        window.setTimeout(() => setMode("hidden"), 2500);
      } else {
        setMessage("לא הצלחנו להפעיל התראות. נסו שוב מאוחר יותר.");
      }
    } catch {
      setMessage("לא הצלחנו להפעיל התראות בדפדפן הזה.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="התראות מהחנות"
      className="fixed inset-x-3 top-3 z-[60] mx-auto max-w-md rounded-2xl border bg-white p-4 shadow-xl sm:inset-x-auto sm:right-4"
      dir="rtl"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="סגירה"
        className="absolute left-2 top-2 flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </button>
      <div className="flex items-start gap-3 pl-8">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Bell className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          {mode === "ask" ? (
            <>
              <p className="font-bold">לקבל עדכונים לטלפון?</p>
              <p className="mt-1 text-sm text-muted-foreground">
                נשלח הודעה קצרה כשהדוכן פתוח או כשההזמנות לשבת עומדות להיסגר. בלי ספאם.
              </p>
              {message ? (
                <p className="mt-2 text-sm font-medium">{message}</p>
              ) : (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={accept}
                    disabled={busy}
                    className="min-h-11 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-60"
                  >
                    {busy ? "רגע…" : "כן, לעדכן אותי"}
                  </button>
                  <button
                    type="button"
                    onClick={dismiss}
                    className="min-h-11 rounded-lg px-4 text-sm text-muted-foreground hover:bg-muted"
                  >
                    לא עכשיו
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <p className="font-bold">הוסיפו למסך הבית</p>
              <p className="mt-1 text-sm text-muted-foreground">
                באייפון אפשר לקבל עדכונים מהחנות רק מהאפליקציה במסך הבית:
              </p>
              <ol className="mt-2 list-decimal space-y-1 pr-5 text-sm">
                <li>
                  לוחצים על כפתור השיתוף <Share className="inline h-4 w-4 align-text-bottom" aria-label="שיתוף" /> בתחתית
                  ספארי
                </li>
                <li>בוחרים &quot;הוספה למסך הבית&quot;</li>
                <li>פותחים את האתר מהאייקון ומאשרים התראות</li>
              </ol>
              <button
                type="button"
                onClick={dismiss}
                className="mt-3 min-h-11 rounded-lg px-4 text-sm text-muted-foreground hover:bg-muted"
              >
                הבנתי
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
