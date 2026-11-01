"use client";

// Small building blocks shared by the operations screens.

import * as React from "react";
import { useStaffRefresh } from "@/lib/staff/refresh";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { T } from "@/lib/staff/labels";
import { addDays } from "@/lib/staff/week";
import { OPS } from "@/lib/staff/ops/labels";
import { formatDate } from "@/lib/staff/ops/client";

export function LoadingBlock() {
  return (
    <div className="flex items-center justify-center gap-2 rounded-lg border bg-background p-10 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      {T.loading}
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center text-sm">
      <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
      <p>{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {T.refresh}
        </Button>
      )}
    </div>
  );
}

export function EmptyBlock({ message, children }: { message: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed bg-background p-8 text-center text-sm text-muted-foreground">
      <Inbox className="h-5 w-5" aria-hidden="true" />
      <p>{message}</p>
      {children}
    </div>
  );
}

/** Native select styled like Input — best on phones. */
export const NativeSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 md:h-10",
        className,
      )}
      {...props}
    />
  ),
);
NativeSelect.displayName = "NativeSelect";

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  );
}

/** Side sheet used for every add/edit form. */
export function FormSheet({
  open,
  onOpenChange,
  title,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">{children}</div>
        <DialogFooter>{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Centered confirm box for destructive actions. Built on Radix Dialog so it
 * stacks correctly on top of an open FormSheet.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  destructive = true,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && !busy && onCancel()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/50" />
        <DialogPrimitive.Content
          role="alertdialog"
          className="fixed inset-x-4 bottom-4 z-[90] mx-auto max-w-sm space-y-4 rounded-lg bg-background p-5 shadow-xl sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2"
          onPointerDownOutside={(e) => busy && e.preventDefault()}
        >
          <DialogPrimitive.Title className="text-base font-semibold">{title}</DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description className="text-sm text-muted-foreground">{description}</DialogPrimitive.Description>
          ) : (
            <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" className="h-11 sm:h-10" onClick={onCancel} disabled={busy}>
              {T.cancel}
            </Button>
            <Button
              variant={destructive ? "destructive" : "default"}
              className="h-11 sm:h-10"
              onClick={onConfirm}
              disabled={busy}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {confirmLabel}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Week navigation: previous / this week / next. RTL — "previous" points right. */
export function WeekPicker({
  weekStart,
  weekEnd,
  isCurrentWeek,
  onChange,
}: {
  weekStart: string;
  weekEnd: string;
  isCurrentWeek: boolean;
  onChange: (weekStart: string | null) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg border bg-background p-1">
      <Button variant="ghost" size="icon" aria-label={OPS.prevWeek} onClick={() => onChange(addDays(weekStart, -7))}>
        <ChevronRight className="h-5 w-5" />
      </Button>
      <div className="min-w-[8.5rem] text-center text-sm">
        <p className="font-medium">
          {formatDate(weekStart)}–{formatDate(weekEnd)}
        </p>
        {isCurrentWeek ? (
          <p className="text-xs text-primary">{T.thisWeek}</p>
        ) : (
          <button type="button" className="text-xs text-muted-foreground underline" onClick={() => onChange(null)}>
            {OPS.currentWeek}
          </button>
        )}
      </div>
      <Button variant="ghost" size="icon" aria-label={OPS.nextWeek} onClick={() => onChange(addDays(weekStart, 7))}>
        <ChevronLeft className="h-5 w-5" />
      </Button>
    </div>
  );
}

/** Loads JSON from a staff API with loading / error state and a reload function. */
export function useOpsData<R>(url: string | null, fetcher: (url: string) => Promise<R>) {
  const [data, setData] = React.useState<R | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const fetcherRef = React.useRef(fetcher);
  fetcherRef.current = fetcher;

  const requestId = React.useRef(0);

  const load = React.useCallback(async () => {
    if (!url) return;
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fetcherRef.current(url);
      if (id === requestId.current) setData(result);
    } catch (e) {
      if (id === requestId.current) setError(e instanceof Error ? e.message : T.loadError);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [url]);

  React.useEffect(() => {
    void load();
  }, [load]);

  useStaffRefresh(load);
  return { data, setData, error, loading, reload: load };
}
