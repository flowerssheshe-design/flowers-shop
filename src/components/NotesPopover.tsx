"use client";

import { useEffect, useRef, useState } from "react";
import { StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";

export function NotesPopover({
  notes,
  trigger,
  className,
}: {
  notes: string;
  trigger?: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const handleEnter = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setOpen(true), 150);
  };
  const handleLeave = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setOpen(false), 200);
  };

  return (
    <div
      ref={containerRef}
      className={cn("relative inline-block", className)}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        aria-label="הערות"
      >
        {trigger ?? (
          <>
            <StickyNote className="h-3.5 w-3.5" />
            <span>הערות</span>
          </>
        )}
      </button>
      {open && (
        <div
          className="absolute z-50 mt-1 w-64 max-w-[80vw] rounded-md border border-slate-200 bg-white p-4 text-sm shadow-2xl dark:bg-white"
          dir="rtl"
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
        >
          <p className="whitespace-pre-wrap break-words max-h-48 overflow-auto text-foreground">
            {notes}
          </p>
        </div>
      )}
    </div>
  );
}
