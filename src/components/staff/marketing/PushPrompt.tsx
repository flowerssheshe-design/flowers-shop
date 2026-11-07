"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Bell, BellOff, Share, X } from "lucide-react";
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

/** "לא עכשיו" hides the prompt for 30 days; "אל תשאלו שוב" for good. */
function writeDismissed(forever = false) {
  try {
    localStorage.setItem(PROMPT_DISMISS_KEY, forever ? "never" : String(Date.now()));
  } catch {
    // private mode: the prompt may show again, that's fine
  }
}

/** Set when the customer turned notifications off here, so we don't quietly subscribe again. */
const PUSH_OFF_KEY = "flowers_push_off";
function readOff(): boolean {
  try {
    return localStorage.getItem(PUSH_OFF_KEY) === "1";
  } catch {
    return false;
  }
}
function writeOff(off: boolean) {
  try {
    if (off) localStorage.setItem(PUSH_OFF_KEY, "1");
    else localStorage.removeItem(PUSH_OFF_KEY);
  } catch {
    // ignore
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

/**
 * Right after sign-up with "אישור קבלת הודעות ועדכונים": ask the browser for
 * notification permission. Must start inside the click (browsers allow the
 * permission window only from a user action), so the permission is asked at
 * once and the subscription is saved when `afterSignup` resolves. Never throws.
 */
export function askPushOnSignup(afterSignup: Promise<boolean>): void {
  try {
    if (!VAPID_KEY || !pushSupported() || Notification.permission === "denied") return;
    // iPhone: push works only from the Home Screen app; the regular prompt explains that.
    if (isIosDevice(navigator.userAgent, navigator.maxTouchPoints) && !isStandalone()) return;
    const permission = Notification.permission === "granted" ? Promise.resolve("granted" as NotificationPermission) : Notification.requestPermission();
    void Promise.all([permission, afterSignup])
      .then(([p, ok]) => (p === "granted" && ok ? subscribe() : false))
      .catch(() => false);
  } catch {
    // no notifications on this browser
  }
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

async function unsubscribe(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await fetch("/api/push/subscribe", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => undefined);
  await sub.unsubscribe().catch(() => false);
}

type ToggleState = "loading" | "on" | "off" | "blocked" | "unsupported" | "ios";

const TOGGLE_TEXT: Record<ToggleState, string> = {
  loading: "בודקים…",
  on: "פעילות. נשלח הודעה קצרה לפני שההזמנות לשבת נסגרות.",
  off: "כבויות. אפשר להפעיל בכל רגע.",
  blocked: "חסומות בדפדפן. כדי להפעיל, מאשרים התראות לאתר בהגדרות הדפדפן.",
  unsupported: "הדפדפן הזה לא תומך בהתראות.",
  ios: "באייפון מקבלים התראות רק מהאתר שבמסך הבית (שיתוף ← הוספה למסך הבית).",
};

/**
 * "התראות לטלפון" on/off for the customer (profile page). Off removes this
 * browser's subscription and stops the quiet re-subscribe; on asks again.
 */
export function NotificationToggle() {
  const [state, setState] = useState<ToggleState>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        if (!VAPID_KEY) return setState("unsupported");
        if (isIosDevice(navigator.userAgent, navigator.maxTouchPoints) && !isStandalone()) return setState("ios");
        if (!pushSupported()) return setState("unsupported");
        if (Notification.permission === "denied") return setState("blocked");
        const reg = await navigator.serviceWorker.getRegistration("/sw.js");
        const sub = await reg?.pushManager.getSubscription();
        setState(sub && !readOff() ? "on" : "off");
      } catch {
        setState("unsupported");
      }
    })();
  }, []);

  async function toggle() {
    setBusy(true);
    try {
      if (state === "on") {
        writeOff(true);
        await unsubscribe();
        setState("off");
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? "blocked" : "off");
          return;
        }
        writeOff(false);
        setState((await subscribe()) ? "on" : "off");
      }
    } catch {
      // keep the current state
    } finally {
      setBusy(false);
    }
  }

  const canToggle = state === "on" || state === "off";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2">
        {state === "on" ? (
          <Bell className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        ) : (
          <BellOff className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
        <div className="min-w-0">
          <p className="font-medium">התראות לטלפון</p>
          <p className="text-sm text-muted-foreground">{TOGGLE_TEXT[state]}</p>
        </div>
      </div>
      {canToggle && (
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={busy}
          className={
            state === "on"
              ? "min-h-11 rounded-lg border px-4 text-sm font-medium hover:bg-muted disabled:opacity-60"
              : "min-h-11 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-60"
          }
        >
          {busy ? "רגע…" : state === "on" ? "כיבוי התראות" : "הפעלת התראות"}
        </button>
      )}
    </div>
  );
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
      if (pushSupported() && Notification.permission === "granted" && !readOff()) {
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

  const dismiss = (forever = false) => {
    writeDismissed(forever);
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
      writeOff(false);
      const ok = await subscribe();
      if (ok) {
        setMessage("מעולה! נעדכן אתכם לפני שההזמנות לשבת נסגרות 🌸");
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

  // A bottom sheet on phones, a card in the corner on computers: above the
  // header, the cart bar and the banner, and always fully on screen.
  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="התראות מהחנות"
      dir="rtl"
      className="fixed inset-x-0 bottom-0 z-[90] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:inset-x-auto sm:bottom-4 sm:left-4 sm:px-0 sm:pb-0"
    >
      <div className="mx-auto max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl border border-primary/15 bg-white p-5 shadow-2xl sm:w-[380px]">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Bell className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold leading-tight">
              {mode === "ask" ? "לדעת לפני שההזמנות לשבת נסגרות?" : "רוצים לקבל עדכונים מהחנות?"}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {mode === "ask"
                ? "הודעה קצרה פעמיים בשבוע: כשאפשר עוד להזמין מראש, ולפני שישי. בלי ספאם, ואפשר לכבות בכל רגע."
                : "באייפון אפשר לקבל התראות רק מהאתר שבמסך הבית. זה לוקח 10 שניות:"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => dismiss()}
            aria-label="סגירה"
            className="-ml-1 -mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {mode === "ios_install" && (
          <ol className="mt-3 space-y-2 text-sm">
            <li className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</span>
              <span>
                לוחצים על <Share className="inline h-4 w-4 align-text-bottom" aria-label="שיתוף" /> בתחתית ספארי
              </span>
            </li>
            <li className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">2</span>
              <span>בוחרים &quot;הוספה למסך הבית&quot;</span>
            </li>
            <li className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">3</span>
              <span>פותחים מהאייקון ומאשרים התראות</span>
            </li>
          </ol>
        )}

        {message ? (
          <p className="mt-4 rounded-lg bg-primary/10 p-3 text-center text-sm font-medium text-primary">{message}</p>
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            {mode === "ask" ? (
              <button
                type="button"
                onClick={accept}
                disabled={busy}
                className="min-h-12 w-full rounded-xl bg-primary px-4 text-base font-bold text-primary-foreground disabled:opacity-60"
              >
                {busy ? "רגע…" : "כן, לעדכן אותי"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => dismiss()}
                className="min-h-12 w-full rounded-xl bg-primary px-4 text-base font-bold text-primary-foreground"
              >
                הבנתי
              </button>
            )}
            <div className="flex items-center justify-between gap-2">
              {mode === "ask" ? (
                <button type="button" onClick={() => dismiss()} className="min-h-10 rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted">
                  לא עכשיו
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={() => dismiss(true)}
                className="min-h-10 rounded-lg px-3 text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                אל תשאלו אותי שוב
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
