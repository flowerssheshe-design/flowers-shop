"use client";

import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Big − / number / + control for phones. */
export function QtyStepper({
  value,
  onChange,
  min = 0,
  max = 9999,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  label: string;
}) {
  const set = (n: number) => onChange(Math.min(max, Math.max(min, Math.trunc(n) || 0)));
  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      <Button
        type="button"
        variant="outline"
        className="h-12 w-12 shrink-0 p-0"
        onClick={() => set(value + 1)}
        disabled={value >= max}
        aria-label="הוספה"
      >
        <Plus className="h-5 w-5" />
      </Button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(e) => set(Number(e.target.value))}
        onFocus={(e) => e.target.select()}
        className="h-12 w-16 min-w-0 rounded-md border border-input bg-background text-center text-lg font-semibold tabular-nums"
        aria-label={label}
      />
      <Button
        type="button"
        variant="outline"
        className="h-12 w-12 shrink-0 p-0"
        onClick={() => set(value - 1)}
        disabled={value <= min}
        aria-label="הפחתה"
      >
        <Minus className="h-5 w-5" />
      </Button>
    </div>
  );
}
