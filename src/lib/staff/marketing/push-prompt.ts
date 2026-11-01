// When to show the customer "turn on notifications" prompt. Pure logic,
// used by the browser component (src/components/staff/marketing/PushPrompt.tsx).

import { isTrackedPath } from "./tracking";

export const PROMPT_DISMISS_KEY = "flowers_push_prompt_dismissed_at";
export const PROMPT_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

const NO_PROMPT_PATHS = ["/login", "/forgot-password", "/reset-password", "/checkout"];

export function isPromptPath(pathname: string | null | undefined): boolean {
  if (!isTrackedPath(pathname)) return false;
  const p = (pathname ?? "").toLowerCase();
  return !NO_PROMPT_PATHS.some((x) => p === x || p.startsWith(x + "/"));
}

export function isSnoozed(dismissedAt: string | null | undefined, now: number = Date.now()): boolean {
  const t = Number(dismissedAt);
  return Number.isFinite(t) && t > 0 && now - t < PROMPT_SNOOZE_MS;
}

export function isIosDevice(ua: string, maxTouchPoints = 0): boolean {
  // iPadOS 13+ reports itself as Mac with touch.
  return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && maxTouchPoints > 1);
}

export type PromptMode = "hidden" | "ask" | "ios_install";

export function promptMode(env: {
  pathname: string;
  dismissedAt: string | null;
  now?: number;
  vapidKey: string;
  ios: boolean;
  standalone: boolean;
  pushSupported: boolean;
  permission: NotificationPermission | "unsupported";
}): PromptMode {
  if (!env.vapidKey || !isPromptPath(env.pathname) || isSnoozed(env.dismissedAt, env.now)) return "hidden";
  // On iPhone, push only works from the Home Screen app (iOS 16.4+).
  if (env.ios && !env.standalone) return "ios_install";
  if (!env.pushSupported) return "hidden";
  if (env.permission !== "default") return "hidden";
  return "ask";
}

/** VAPID public key (base64url) → Uint8Array for pushManager.subscribe. */
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
