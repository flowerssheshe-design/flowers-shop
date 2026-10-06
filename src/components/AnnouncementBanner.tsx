"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useSystemSettings } from "@/lib/useSystemSettings";

const DISMISS_KEY_PREFIX = "announcement-dismissed:";

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

export function AnnouncementBanner() {
  const settings = useSystemSettings();
  const text = settings.announcement_banner_text?.trim() ?? "";
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch: only render after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!text) {
      setVisible(false);
      return;
    }
    if (typeof window === "undefined") return;

    const dismissed = sessionStorage.getItem(`${DISMISS_KEY_PREFIX}${hashString(text)}`);
    setVisible(!dismissed);
  }, [text]);

  if (!mounted || !text) return null;

  if (!visible) return null;

  function handleClose() {
    try {
      sessionStorage.setItem(`${DISMISS_KEY_PREFIX}${hashString(text)}`, "1");
    } catch {
      /* ignore storage errors */
    }
    setVisible(false);
  }

  return (
    <div
      className="sticky top-0 z-[70] w-full border-b border-primary/20 bg-gradient-to-r from-primary/95 via-primary to-primary/90 text-primary-foreground shadow-md"
      role="banner"
      aria-live="polite"
    >
      <div className="container flex items-center justify-between gap-3 py-2.5 px-4 sm:px-6">
        <p className="text-sm font-medium leading-snug sm:text-base">
          {text}
        </p>
        <button
          type="button"
          onClick={handleClose}
          aria-label="סגור"
          className="flex shrink-0 items-center justify-center rounded-full bg-white/15 p-2.5 text-white transition hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-primary/60"
          style={{ minHeight: 44, minWidth: 44 }}
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}