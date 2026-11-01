"use client";

import * as React from "react";
import { Bike, CheckCircle2, CreditCard, Gift, MapPin, Phone, Search, ShoppingBag, StickyNote, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toaster";
import { StaffPageHeader, type ShellEmployee } from "@/components/staff/StaffShell";
import { T } from "@/lib/staff/labels";
import { canManageTeam } from "@/lib/staff/access";
import { cn, formatILS } from "@/lib/utils";
import { OPS, ORDER_TYPE_LABELS, PAYMENT_LABELS } from "@/lib/staff/ops/labels";
import { formatDateTime, opsFetch } from "@/lib/staff/ops/client";
import { ORDER_STATUSES, ORDER_TYPES, actionsFor, filterOrders, isDelivery, summarizeOrders, type OrderAction, type OrderFilters } from "@/lib/staff/ops/orders";
import type { OrdersSummary, StaffOrder } from "@/lib/staff/ops/types";
import { ConfirmDialog, EmptyBlock, ErrorBlock, FormSheet, LoadingBlock, NativeSelect, WeekPicker, useOpsData } from "./common";

type OrdersResponse = {
  weekStart: string;
  weekEnd: string;
  isCurrentWeek: boolean;
  orders: StaffOrder[];
  summary: OrdersSummary;
};

const STATUS_STYLE: Record<string, string> = {
  pending_payment: "bg-amber-100 text-amber-900",
  approved: "bg-sky-100 text-sky-900",
  completed: "bg-primary/15 text-primary",
  cancelled: "bg-muted text-muted-foreground line-through",
  archived: "bg-muted text-muted-foreground",
};

function StatusBadge({ status }: { status: string }) {
  return <Badge className={cn("hover:bg-inherit", STATUS_STYLE[status])}>{T.status[status] ?? status}</Badge>;
}

const ACTION_LABEL: Record<OrderAction, string> = {
  approve: OPS.approvePayment,
  complete: OPS.markCompleted,
  cancel: OPS.cancelOrder,
};

export function OrdersView({ me }: { me: ShellEmployee }) {
  const [week, setWeek] = React.useState<string | null>(null);
  const url = `/api/staff/orders${week ? `?week=${week}` : ""}`;
  const { data, error, loading, reload, setData } = useOpsData<OrdersResponse>(url, (u) => opsFetch(u));
  const [filters, setFilters] = React.useState<OrderFilters>({ status: "all", type: "all", fulfillment: "all", query: "" });
  const [openId, setOpenId] = React.useState<string | null>(null);
  const { toast } = useToast();

  const orders = React.useMemo(() => (data ? filterOrders(data.orders, filters) : []), [data, filters]);
  const open = data?.orders.find((o) => o.id === openId) ?? null;
  const setF = <K extends keyof OrderFilters>(k: K, v: OrderFilters[K]) => setFilters((f) => ({ ...f, [k]: v }));

  function replaceOrder(o: StaffOrder) {
    setData((d) => {
      if (!d) return d;
      const list = d.orders.map((x) => (x.id === o.id ? o : x));
      return { ...d, orders: list, summary: summarizeOrders(list) };
    });
  }

  async function deleteOrder(o: StaffOrder) {
    await opsFetch(`/api/staff/orders/${o.id}`, { method: "DELETE" });
    setOpenId(null);
    setData((d) => {
      if (!d) return d;
      const list = d.orders.filter((x) => x.id !== o.id);
      return { ...d, orders: list, summary: summarizeOrders(list) };
    });
    toast({ title: "ההזמנה נמחקה", variant: "success" });
  }

  async function runAction(o: StaffOrder, action: OrderAction) {
    const res = await opsFetch<{ order: StaffOrder }>(`/api/staff/orders/${o.id}`, { method: "PATCH", body: { action } });
    replaceOrder(res.order);
    toast({
      title: action === "approve" ? "התשלום אושר" : action === "complete" ? "ההזמנה סומנה כהושלמה" : "ההזמנה בוטלה",
      variant: "success",
    });
  }

  return (
    <div>
      <StaffPageHeader
        title={T.orders}
        description="אישור תשלום, סימון הזמנות שהושלמו וביטול."
        actions={
          data && (
            <WeekPicker weekStart={data.weekStart} weekEnd={data.weekEnd} isCurrentWeek={data.isCurrentWeek} onChange={setWeek} />
          )
        }
      />

      {loading && !data ? (
        <LoadingBlock />
      ) : error && !data ? (
        <ErrorBlock message={error} onRetry={reload} />
      ) : data ? (
        <div className={cn("space-y-4", loading && "opacity-60")}>
          <Summary summary={data.summary} onPickStatus={(s) => setF("status", filters.status === s ? "all" : s)} active={filters.status} />

          <div className="grid gap-2 rounded-lg border bg-background p-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative sm:col-span-2 lg:col-span-1">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                className="h-11 pr-9 md:h-10"
                value={filters.query}
                onChange={(e) => setF("query", e.target.value)}
                placeholder={OPS.searchPlaceholder}
                aria-label={T.search}
              />
            </div>
            <NativeSelect value={filters.status} onChange={(e) => setF("status", e.target.value)} aria-label="סטטוס">
              <option value="all">{OPS.allStatuses}</option>
              {ORDER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {T.status[s]}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect value={filters.type} onChange={(e) => setF("type", e.target.value)} aria-label="סוג הזמנה">
              <option value="all">{OPS.allTypes}</option>
              {ORDER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ORDER_TYPE_LABELS[t]}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect value={filters.fulfillment} onChange={(e) => setF("fulfillment", e.target.value)} aria-label="משלוח או איסוף">
              <option value="all">{OPS.allFulfillment}</option>
              <option value="delivery">{T.delivery}</option>
              <option value="pickup">{T.pickup}</option>
            </NativeSelect>
          </div>

          {error && <ErrorBlock message={error} onRetry={reload} />}

          {data.orders.length === 0 ? (
            <EmptyBlock message={OPS.noOrders} />
          ) : orders.length === 0 ? (
            <EmptyBlock message={OPS.noMatches}>
              <Button variant="outline" onClick={() => setFilters({ status: "all", type: "all", fulfillment: "all", query: "" })}>
                ניקוי הסינון
              </Button>
            </EmptyBlock>
          ) : (
            <>
              <ul className="space-y-2 md:hidden">
                {orders.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => setOpenId(o.id)}
                      className="w-full rounded-lg border bg-background p-3 text-start transition hover:bg-accent"
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{o.customer_name || "—"}</span>
                          <span className="block text-xs text-muted-foreground">
                            {formatDateTime(o.created_at)} · {ORDER_TYPE_LABELS[o.order_type]}
                          </span>
                        </span>
                        <StatusBadge status={o.status} />
                      </span>
                      <span className="mt-2 flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1 text-muted-foreground">
                          {isDelivery(o) ? <Bike className="h-4 w-4" aria-hidden="true" /> : <ShoppingBag className="h-4 w-4" aria-hidden="true" />}
                          {isDelivery(o) ? T.delivery : T.pickup}
                        </span>
                        <span className="font-semibold">{formatILS(o.total_amount)}</span>
                      </span>
                      <OrderNotes order={o} compact />
                    </button>
                  </li>
                ))}
              </ul>

              <div className="hidden overflow-x-auto rounded-lg border bg-background md:block">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-right text-xs text-muted-foreground">
                    <tr>
                      <th className="p-3 font-medium">{T.customer}</th>
                      <th className="p-3 font-medium">{OPS.date}</th>
                      <th className="p-3 font-medium">סוג</th>
                      <th className="p-3 font-medium">{T.delivery}/{T.pickup}</th>
                      <th className="p-3 font-medium">{T.total}</th>
                      <th className="p-3 font-medium">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr key={o.id} className="cursor-pointer border-t hover:bg-accent/50" onClick={() => setOpenId(o.id)}>
                        <td className="p-3">
                          <button type="button" className="text-start font-medium hover:underline" onClick={() => setOpenId(o.id)}>
                            {o.customer_name || "—"}
                          </button>
                          <span className="block text-xs text-muted-foreground" dir="ltr" style={{ textAlign: "right" }}>
                            {o.customer_phone}
                          </span>
                          <span className="block max-w-sm">
                            <OrderNotes order={o} compact />
                          </span>
                        </td>
                        <td className="p-3 text-muted-foreground">{formatDateTime(o.created_at)}</td>
                        <td className="p-3">{ORDER_TYPE_LABELS[o.order_type]}</td>
                        <td className="p-3">{isDelivery(o) ? T.delivery : T.pickup}</td>
                        <td className="p-3 font-medium">{formatILS(o.total_amount)}</td>
                        <td className="p-3">
                          <StatusBadge status={o.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">
                מוצגות {orders.length} מתוך {data.orders.length} הזמנות.
              </p>
            </>
          )}
        </div>
      ) : null}

      {open && (
        <OrderSheet
          key={open.id}
          order={open}
          onClose={() => setOpenId(null)}
          onAction={runAction}
          onDelete={canManageTeam(me) ? deleteOrder : undefined}
        />
      )}
    </div>
  );
}

/**
 * The customer's greeting (for the card with the bouquet) and their notes.
 * Shown at the top of the order and, shortened, in the list.
 */
function OrderNotes({ order, compact = false }: { order: Pick<StaffOrder, "greeting_note" | "notes">; compact?: boolean }) {
  const greeting = order.greeting_note?.trim();
  const notes = order.notes?.trim();
  if (!greeting && !notes) return null;
  return (
    <span className={cn("block space-y-1.5", compact ? "mt-2" : "")}>
      {greeting && (
        <span className="block rounded-md border border-pink-200 bg-pink-50 px-3 py-2 text-sm text-pink-950">
          <span className="mb-0.5 flex items-center gap-1 font-semibold">
            <Gift className="h-4 w-4 shrink-0" aria-hidden="true" />
            {OPS.greeting}
          </span>
          <span className={cn("block whitespace-pre-wrap", compact && "line-clamp-2")}>{greeting}</span>
        </span>
      )}
      {notes && (
        <span className="block rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <span className="mb-0.5 flex items-center gap-1 font-semibold">
            <StickyNote className="h-4 w-4 shrink-0" aria-hidden="true" />
            {OPS.notes}
          </span>
          <span className={cn("block whitespace-pre-wrap", compact && "line-clamp-2")}>{notes}</span>
        </span>
      )}
    </span>
  );
}

function Summary({
  summary,
  active,
  onPickStatus,
}: {
  summary: OrdersSummary;
  active: string;
  onPickStatus: (s: string) => void;
}) {
  const statuses = ["pending_payment", "approved", "completed", "cancelled"];
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {statuses.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPickStatus(s)}
            aria-pressed={active === s}
            className={cn(
              "rounded-lg border bg-background p-3 text-start transition hover:bg-accent",
              active === s && "border-primary ring-1 ring-primary",
            )}
          >
            <span className="block text-2xl font-bold tabular-nums">{summary.byStatus[s] ?? 0}</span>
            <span className="block text-xs text-muted-foreground">{T.status[s]}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span>
          {T.total}: <b className="text-foreground">{summary.total}</b>
        </span>
        {ORDER_TYPES.map((t) =>
          summary.byType[t] ? (
            <span key={t}>
              {ORDER_TYPE_LABELS[t]}: <b className="text-foreground">{summary.byType[t]}</b>
            </span>
          ) : null,
        )}
        <span>
          {T.deliveries}: <b className="text-foreground">{summary.delivery}</b>
        </span>
        <span>
          {T.pickup}: <b className="text-foreground">{summary.pickup}</b>
        </span>
      </div>
    </div>
  );
}

function OrderSheet({
  order: o,
  onClose,
  onAction,
  onDelete,
}: {
  order: StaffOrder;
  onClose: () => void;
  onAction: (o: StaffOrder, a: OrderAction) => Promise<void>;
  /** Main managers only. */
  onDelete?: (o: StaffOrder) => Promise<void>;
}) {
  const [busy, setBusy] = React.useState<OrderAction | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const actions = actionsFor(o.status);
  const itemsTotal = o.items.reduce((sum, it) => sum + it.qty * it.price, 0);

  async function act(a: OrderAction) {
    setBusy(a);
    setErr(null);
    try {
      await onAction(o, a);
      setConfirmCancel(false);
    } catch (e) {
      setConfirmCancel(false);
      setErr(e instanceof Error ? e.message : T.saveError);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <FormSheet
        open
        onOpenChange={(v) => !v && !busy && onClose()}
        title={OPS.orderDetails}
        footer={
          actions.length === 0 ? (
            <Button variant="outline" className="h-11 sm:h-10" onClick={onClose}>
              {T.close}
            </Button>
          ) : (
            <>
              {actions.includes("cancel") && (
                <Button
                  variant="outline"
                  className="h-11 text-destructive hover:text-destructive sm:h-10"
                  disabled={!!busy}
                  onClick={() => setConfirmCancel(true)}
                >
                  <XCircle className="h-4 w-4" aria-hidden="true" />
                  {OPS.cancelOrder}
                </Button>
              )}
              {actions.includes("complete") && (
                <Button
                  variant={actions.includes("approve") ? "outline" : "default"}
                  className="h-11 sm:h-10"
                  disabled={!!busy}
                  onClick={() => act("complete")}
                >
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  {busy === "complete" ? T.saving : ACTION_LABEL.complete}
                </Button>
              )}
              {actions.includes("approve") && (
                <Button className="h-11 sm:h-10" disabled={!!busy} onClick={() => act("approve")}>
                  <CreditCard className="h-4 w-4" aria-hidden="true" />
                  {busy === "approve" ? T.saving : ACTION_LABEL.approve}
                </Button>
              )}
            </>
          )
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={o.status} />
          <Badge variant="outline">{ORDER_TYPE_LABELS[o.order_type]}</Badge>
          <Badge variant="outline">{isDelivery(o) ? T.delivery : T.pickup}</Badge>
          {o.is_member && <Badge variant="secondary">לקוח קבוע</Badge>}
        </div>
        <p className="text-xs text-muted-foreground">{formatDateTime(o.created_at)}</p>

        <OrderNotes order={o} />

        <section className="space-y-1.5 rounded-md border p-3 text-sm">
          <p className="font-medium">{o.customer_name || "—"}</p>
          {o.customer_phone && (
            <a href={`tel:${o.customer_phone}`} dir="ltr" className="inline-flex items-center gap-1 text-primary">
              <Phone className="h-3.5 w-3.5" aria-hidden="true" />
              {o.customer_phone}
            </a>
          )}
          {isDelivery(o) && (
            <p className="flex items-start gap-1">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {o.delivery_address || "לא נמסרה כתובת"}
            </p>
          )}
        </section>

        <section className="rounded-md border text-sm">
          <p className="border-b px-3 py-2 font-medium">{OPS.items}</p>
          {o.items.length === 0 ? (
            <p className="px-3 py-2 text-muted-foreground">{T.none}</p>
          ) : (
            <ul className="divide-y">
              {o.items.map((it, i) => (
                <li key={`${it.productId}-${i}`} className="flex justify-between gap-2 px-3 py-2">
                  <span>
                    {it.title} <span className="text-muted-foreground">×{it.qty}</span>
                  </span>
                  <span className="tabular-nums">{formatILS(it.qty * it.price)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="space-y-1 border-t px-3 py-2">
            {o.delivery_fee > 0 && (
              <p className="flex justify-between text-muted-foreground">
                <span>{OPS.deliveryFee}</span>
                <span>{formatILS(o.delivery_fee)}</span>
              </p>
            )}
            {Math.abs(itemsTotal + o.delivery_fee - o.total_amount) > 0.01 && (
              <p className="flex justify-between text-muted-foreground">
                <span>הנחה / התאמה</span>
                <span>{formatILS(o.total_amount - itemsTotal - o.delivery_fee)}</span>
              </p>
            )}
            <p className="flex justify-between font-semibold">
              <span>{T.total}</span>
              <span>{formatILS(o.total_amount)}</span>
            </p>
          </div>
        </section>

        <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">{OPS.payment}</dt>
          <dd>{o.payment_method ? PAYMENT_LABELS[o.payment_method] : "—"}</dd>
          {o.approved_by_name && (
            <>
              <dt className="text-muted-foreground">{OPS.approvedBy}</dt>
              <dd>{o.approved_by_name}</dd>
            </>
          )}
        </dl>

        {err && (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {err}
          </p>
        )}

        {onDelete && o.order_type !== "stall" && (
          <div className="border-t pt-3">
            <Button
              variant="ghost"
              className="h-11 w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={!!busy || deleting}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              מחיקת ההזמנה לגמרי
            </Button>
          </div>
        )}
      </FormSheet>
      <ConfirmDialog
        open={confirmDelete}
        title="למחוק את ההזמנה לגמרי?"
        description="ההזמנה תימחק מהמערכת ולא תיספר בשום מקום (גם לא להנחת לקוח קבוע). אם ירד בשבילה מלאי, הוא יחזור. אי אפשר לבטל את המחיקה."
        confirmLabel="מחיקה"
        busy={deleting}
        onConfirm={async () => {
          setDeleting(true);
          setErr(null);
          try {
            await onDelete!(o);
          } catch (e) {
            setErr(e instanceof Error ? e.message : T.saveError);
          } finally {
            setDeleting(false);
            setConfirmDelete(false);
          }
        }}
        onCancel={() => setConfirmDelete(false)}
      />
      <ConfirmDialog
        open={confirmCancel}
        title={OPS.cancelOrder + "?"}
        description={OPS.cancelOrderConfirm}
        confirmLabel={OPS.cancelOrder}
        busy={busy === "cancel"}
        onConfirm={() => act("cancel")}
        onCancel={() => setConfirmCancel(false)}
      />
    </>
  );
}
