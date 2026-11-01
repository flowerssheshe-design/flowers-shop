"use client";

import { useStaffRefresh } from "@/lib/staff/refresh";
import { useCallback, useEffect, useRef, useState } from "react";
import { T } from "@/lib/staff/labels";

/** fetch + JSON with Hebrew errors. Sends logged-out staff back to the login page. */
export async function api<R = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<R> {
  const { json, ...rest } = init ?? {};
  let res: Response;
  try {
    res = await fetch(url, {
      cache: "no-store",
      ...rest,
      headers: json !== undefined ? { "Content-Type": "application/json", ...rest.headers } : rest.headers,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new Error(T.networkError);
  }
  if (res.status === 401 && typeof window !== "undefined") {
    window.location.href = "/staff/login";
  }
  const data = (await res.json().catch(() => null)) as (R & { error?: string }) | null;
  if (!res.ok) throw new Error(data?.error || T.saveError);
  return data as R;
}

/**
 * Loads JSON from `url` and optionally refreshes it every `intervalMs`
 * (paused while the tab is hidden). A failed background refresh keeps the
 * last good data.
 */
export function useStaffData<R>(url: string | null, intervalMs?: number) {
  const [data, setData] = useState<R | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const urlRef = useRef(url);
  urlRef.current = url;

  const load = useCallback(async (quiet = false) => {
    const target = urlRef.current;
    if (!target) return;
    if (!quiet) setLoading(true);
    try {
      const next = await api<R>(target);
      if (urlRef.current === target) {
        setData(next);
        setError(null);
      }
    } catch (e) {
      if (!quiet) setError(e instanceof Error ? e.message : T.loadError);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [url, load]);

  useEffect(() => {
    if (!intervalMs) return;
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs, load]);

  useStaffRefresh(load);
  return { data, error, loading, reload: load, setData };
}

export function formatDate(iso: string): string {
  // iso is "YYYY-MM-DD" (Israel date); noon UTC keeps the day stable.
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("he-IL", {
    timeZone: "Asia/Jerusalem",
    weekday: "long",
    day: "numeric",
    month: "numeric",
  });
}

export function formatTime(ts: string): string {
  return new Date(ts).toLocaleTimeString("he-IL", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateTime(ts: string): string {
  return new Date(ts).toLocaleString("he-IL", {
    timeZone: "Asia/Jerusalem",
    weekday: "short",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
