"use client";

import { AlertCircle, Inbox, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { T } from "@/lib/staff/labels";
import { cn } from "@/lib/utils";

export function LoadingBlock({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center justify-center gap-2 py-10 text-muted-foreground", className)}>
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
      <span>{T.loading}</span>
    </div>
  );
}

export function EmptyBlock({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-2 rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground", className)}>
      <Inbox className="h-6 w-6" aria-hidden="true" />
      <p className="px-4">{text}</p>
    </div>
  );
}

export function ErrorBlock({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
      <AlertCircle className="h-6 w-6 text-destructive" aria-hidden="true" />
      <p className="text-sm">{text}</p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry} className="h-11">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {T.refresh}
        </Button>
      )}
    </div>
  );
}

/** A friendly full-width message (no access today, nothing scheduled...). */
export function NoticeBlock({ text, icon }: { text: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border bg-card p-8 text-center shadow-sm">
      {icon}
      <p className="max-w-sm text-base">{text}</p>
    </div>
  );
}

export function Card({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: React.ReactNode;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border bg-card p-4 shadow-sm", className)}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            {title && <h2 className="text-lg font-semibold">{title}</h2>}
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border bg-background p-3", className)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function RefreshButton({ onClick, busy }: { onClick: () => void; busy?: boolean }) {
  return (
    <Button variant="outline" onClick={onClick} disabled={busy} className="h-11">
      <RefreshCw className={cn("h-4 w-4", busy && "animate-spin")} aria-hidden="true" />
      {T.refresh}
    </Button>
  );
}
