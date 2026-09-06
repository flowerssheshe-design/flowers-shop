"use client";

import { useEffect, useRef } from "react";

const SESSION_KEY = "flowers_visit_session_id";

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let sessionId = sessionStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, sessionId);
  }
  return sessionId;
}

export function VisitTracker() {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    const sessionId = getSessionId();
    if (!sessionId) return;

    const body = JSON.stringify({ session_id: sessionId });

    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/track-visit", blob);
    } else {
      fetch("/api/track-visit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {
        // ignore tracking failures
      });
    }
  }, []);

  return null;
}
