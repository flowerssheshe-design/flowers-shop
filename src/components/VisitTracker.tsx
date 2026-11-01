"use client";

import { useEffect, useRef } from "react";
import { generateUUID } from "@/lib/utils";
import { cleanReferrer, isTrackedPath } from "@/lib/staff/marketing/tracking";

const SESSION_KEY = "flowers_visit_session_id";

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    let sessionId = sessionStorage.getItem(SESSION_KEY);
    if (!sessionId) {
      sessionId = generateUUID();
      sessionStorage.setItem(SESSION_KEY, sessionId);
    }
    return sessionId;
  } catch {
    return "";
  }
}

/**
 * Records one visit per page load on customer pages. Staff and back-office
 * pages (/staff, /admin, /stall, /courier, /go) are never counted. The server
 * reads the marketing cookie (flowers_ref) itself.
 */
export function VisitTracker() {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    const path = window.location.pathname;
    if (!isTrackedPath(path)) return;

    const sessionId = getSessionId();
    if (!sessionId) return;

    const body = JSON.stringify({
      session_id: sessionId,
      landing_path: path.slice(0, 300),
      referrer: cleanReferrer(document.referrer, window.location.host),
    });

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
