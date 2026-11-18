"use client";

import { useEffect, useRef, useState } from "react";
import { BellRing, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { NewStallOrder } from "./stall-types";

/** A short beep so the seller notices even when not looking (silently skipped if the browser blocks sound). */
function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.15;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
    osc.onended = () => void ctx.close();
  } catch {
    // no sound
  }
  try {
    navigator.vibrate?.([200, 100, 200]);
  } catch {
    // no vibration
  }
}

/**
 * Pops up when a new website order from this stall comes in (pickup here, or
 * the courier takes it from here), so the seller sets the bouquets aside.
 * Only while the stall is open; orders already there when the screen opened
 * (or that came while it was closed) don't pop up.
 */
export function NewPickupAlert({ stallId, orders, active }: { stallId: string; orders: NewStallOrder[]; active: boolean }) {
  const seen = useRef<{ stallId: string; ids: Set<string> } | null>(null);
  const [fresh, setFresh] = useState<NewStallOrder[]>([]);

  useEffect(() => {
    if (!seen.current || seen.current.stallId !== stallId) {
      seen.current = { stallId, ids: new Set(orders.map((o) => o.id)) };
      setFresh([]);
      return;
    }
    const added = orders.filter((o) => !seen.current!.ids.has(o.id));
    for (const o of orders) seen.current.ids.add(o.id);
    if (added.length > 0 && active) {
      setFresh((cur) => [...cur, ...added]);
      beep();
    }
  }, [stallId, orders, active]);

  if (fresh.length === 0) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="alertdialog" aria-modal="true" aria-labelledby="new-pickup-title">
      <div className="relative w-full max-w-md rounded-xl bg-background p-5 shadow-xl">
        <button
          type="button"
          onClick={() => setFresh([])}
          className="absolute end-3 top-3 flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          aria-label="סגירה"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
        <p id="new-pickup-title" className="flex items-center gap-2 pe-10 text-lg font-bold text-primary">
          <BellRing className="h-6 w-6" aria-hidden="true" />
          {fresh.length === 1 ? "הזמנה חדשה מהאתר!" : `${fresh.length} הזמנות חדשות מהאתר!`}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">שימו את הזרים האלה בצד.</p>
        <ul className="mt-3 max-h-[50vh] space-y-2 overflow-y-auto">
          {fresh.map((o) => (
            <li key={o.id} className="rounded-lg border p-3">
              <p className="font-semibold">{o.customer_name}</p>
              <p className="text-xs text-muted-foreground">
                {o.delivery ? "משלוח: השליח לוקח מהדוכן" : "איסוף מהדוכן"}
                {!o.paid && " · עוד לא שולם"}
              </p>
              <ul className="mt-1 text-sm">
                {(o.items ?? []).map((it, i) => (
                  <li key={i}>
                    {it.title} × {it.qty}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        <Button className="mt-4 h-12 w-full text-base" onClick={() => setFresh([])}>
          סגירה
        </Button>
      </div>
    </div>
  );
}
