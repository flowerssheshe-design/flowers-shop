"use client";

import { useEffect, useRef, useState } from "react";
import { BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PickupOrder } from "./stall-types";

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
 * Pops up when a new website order for pickup at this stall comes in, so the
 * seller sets the bouquets aside. Orders already there when the screen opened
 * don't pop up.
 */
export function NewPickupAlert({ stallId, orders }: { stallId: string; orders: PickupOrder[] }) {
  const seen = useRef<{ stallId: string; ids: Set<string> } | null>(null);
  const [fresh, setFresh] = useState<PickupOrder[]>([]);

  useEffect(() => {
    const waiting = orders.filter((o) => o.status !== "completed");
    if (!seen.current || seen.current.stallId !== stallId) {
      seen.current = { stallId, ids: new Set(orders.map((o) => o.id)) };
      setFresh([]);
      return;
    }
    const added = waiting.filter((o) => !seen.current!.ids.has(o.id));
    for (const o of orders) seen.current.ids.add(o.id);
    if (added.length > 0) {
      setFresh((cur) => [...cur, ...added]);
      beep();
    }
  }, [stallId, orders]);

  if (fresh.length === 0) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="alertdialog" aria-modal="true" aria-labelledby="new-pickup-title">
      <div className="w-full max-w-md rounded-xl bg-background p-5 shadow-xl">
        <p id="new-pickup-title" className="flex items-center gap-2 text-lg font-bold text-primary">
          <BellRing className="h-6 w-6" aria-hidden="true" />
          {fresh.length === 1 ? "הזמנה חדשה לאיסוף!" : `${fresh.length} הזמנות חדשות לאיסוף!`}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">שימו את הזרים האלה בצד, הלקוח יבוא לאסוף.</p>
        <ul className="mt-3 max-h-[50vh] space-y-2 overflow-y-auto">
          {fresh.map((o) => (
            <li key={o.id} className="rounded-lg border p-3">
              <p className="font-semibold">{o.customer_name}</p>
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
          הבנתי, שמתי בצד
        </Button>
      </div>
    </div>
  );
}
