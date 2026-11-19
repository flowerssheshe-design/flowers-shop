"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toaster";
import { cn, formatILS } from "@/lib/utils";
import { T } from "@/lib/staff/labels";
import { api } from "@/lib/staff/work/client";
import { Card, EmptyBlock } from "./common";

export type ReceiptLine = {
  product_id: string;
  title: string;
  qty: number;
  received_qty?: number | null;
  unit_cost?: number | null;
  /** How many of what arrived were free. */
  free_qty?: number;
  cost_price?: number;
};

/**
 * "מה הגיע": the supply runner or a manager writes how many of each bouquet really came and
 * what was paid per bouquet. The stock and the supplier cost follow.
 */
export function SupplyReceipts({
  lines,
  products,
  isForecast,
  canFixOrders = true,
  onChanged,
}: {
  lines: ReceiptLine[];
  products: { id: string; title: string }[];
  isForecast: boolean;
  /** Managers swap or cancel customers' orders of a missing bouquet; the supply runner only sees that a manager is needed. */
  canFixOrders?: boolean;
  onChanged: () => void;
}) {
  return (
    <div className="space-y-4">
      <Card title="מה הגיע מהספק" description="כמה הגיע בפועל וכמה שולם לכל זר. המלאי באתר ועלות הספק מתעדכנים לפי זה.">
        {isForecast ? (
          <EmptyBlock text="ההזמנה מהספק עוד לא נשלחה. אחרי שהיא נשלחת אפשר לעדכן כאן מה הגיע." />
        ) : lines.length === 0 ? (
          <EmptyBlock text="אין שורות בהזמנה מהספק השבוע." />
        ) : (
          <ul className="space-y-2">
            {lines.map((l) => (
              <ReceiptRow key={l.product_id} line={l} products={products} canFixOrders={canFixOrders} onChanged={onChanged} />
            ))}
          </ul>
        )}
        {!isForecast && <AddExisting products={products.filter((p) => !lines.some((l) => l.product_id === p.id))} onChanged={onChanged} />}
      </Card>
      <NewBouquet onChanged={onChanged} />
    </div>
  );
}

function ReceiptRow({
  line,
  products,
  canFixOrders,
  onChanged,
}: {
  line: ReceiptLine;
  products: { id: string; title: string }[];
  canFixOrders: boolean;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const got = line.received_qty ?? line.qty;
  const gotFree = line.free_qty ?? 0;
  const price = line.unit_cost ?? line.cost_price ?? 0;
  const [qty, setQty] = useState(String(got));
  const [free, setFree] = useState(String(gotFree));
  const [cost, setCost] = useState(String(price));
  const [busy, setBusy] = useState(false);
  const [ordersKey, setOrdersKey] = useState(0);
  useEffect(() => {
    setQty(String(got));
    setFree(String(gotFree));
    setCost(String(price));
  }, [got, gotFree, price]);

  const dirty = Number(qty) !== got || Number(free) !== gotFree || Number(cost) !== price;

  async function save() {
    const q = Math.floor(Number(qty));
    const f = Math.floor(Number(free));
    const c = Number(cost);
    if (!Number.isFinite(q) || q < 0 || !Number.isFinite(f) || f < 0 || !Number.isFinite(c) || c < 0) {
      toast({ title: "כתבו מספרים, 0 או יותר", variant: "error" });
      return;
    }
    if (f > q) {
      toast({ title: "בחינם לא יכול להיות יותר ממה שהגיע", variant: "error" });
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = { product_id: line.product_id };
      if (q !== got) body.received_qty = q;
      if (f !== gotFree) body.free_qty = f;
      if (c !== price) body.unit_cost = c;
      const res = await api<{ toSplit?: number; cutFromStalls?: number }>("/api/staff/supply/lines", { method: "PATCH", json: body });
      const extra = res.toSplit
        ? ` ${res.toSplit} נוספו לזרים שעוד לא חולקו: אפשר לתת אותם לדוכנים בטבלת החלוקה.`
        : res.cutFromStalls
          ? ` ${res.cutFromStalls} ירדו מהדוכנים שהיו להם הכי הרבה.`
          : "";
      toast({ title: `${line.title}: נשמר.${extra}`, variant: "success" });
      onChanged();
    } catch (e) {
      const msg = e instanceof Error ? e.message : T.saveError;
      toast({
        title: canFixOrders ? msg : msg.replace(/קודם החליפו.*$/, "מנהל צריך קודם להחליף או לבטל את ההזמנות האלה, ואז שומרים שוב."),
        variant: "error",
      });
      // The orders list may have changed: load it again.
      setOrdersKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
  }

  const diff = Number(qty) - line.qty;
  const paidUnits = Math.max(0, (Number(qty) || 0) - (Number(free) || 0));
  return (
    <li className="rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium">{line.title}</p>
        <p className="text-xs text-muted-foreground">הוזמנו {line.qty}</p>
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="text-xs">
          <span className="mb-1 block text-muted-foreground">הגיע בפועל</span>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            dir="ltr"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className={cn("h-11 w-24 text-center tabular-nums", diff !== 0 && "border-amber-500")}
          />
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-muted-foreground">מתוכם בחינם</span>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            dir="ltr"
            value={free}
            onChange={(e) => setFree(e.target.value)}
            className="h-11 w-24 text-center tabular-nums"
          />
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-muted-foreground">שולם לזר (₪)</span>
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            dir="ltr"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            className="h-11 w-24 text-center tabular-nums"
          />
        </label>
        <Button className="h-11" onClick={() => void save()} disabled={busy || !dirty}>
          {busy ? T.saving : T.save}
        </Button>
      </div>
      {diff !== 0 && Number.isFinite(diff) && (
        <p className="mt-1 text-xs text-amber-700">{diff > 0 ? `${diff} יותר מההזמנה` : `${-diff} פחות מההזמנה`}: המלאי יתעדכן בהתאם.</p>
      )}
      <p className="mt-1 text-xs text-muted-foreground">
        סה״כ לספק: {formatILS(paidUnits * (Number(cost) || 0))}
        {Number(free) > 0 && ` (${free} בחינם לא נספרים)`}
      </p>
      {Number.isFinite(diff) && diff < 0 &&
        (canFixOrders ? (
          <MissingOrders key={ordersKey} productId={line.product_id} title={line.title} products={products} />
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">אם לקוחות הזמינו את הזר הזה ואין מספיק, מנהל יחליף או יבטל להם את ההזמנה.</p>
        ))}
    </li>
  );
}

type OpenOrder = {
  id: string;
  customer_name: string;
  customer_phone: string;
  status: string;
  payment_method: string | null;
  total_amount: number;
  qty: number;
  delivery: boolean;
  stall_name: string | null;
};

/**
 * Fewer arrived than ordered: the customers' orders that have this bouquet.
 * Talk to the customer, then swap it for another bouquet (same price) or
 * cancel (paid by Bit / PayBox = marked as money to send back).
 */
function MissingOrders({ productId, title, products }: { productId: string; title: string; products: { id: string; title: string }[] }) {
  const { toast } = useToast();
  const [orders, setOrders] = useState<OpenOrder[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [swapTo, setSwapTo] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const res = await api<{ orders: OpenOrder[] }>(`/api/staff/supply/orders?product_id=${productId}`);
      setOrders(res.orders);
    } catch {
      setOrders([]);
    }
  }, [productId]);
  useEffect(() => {
    void load();
  }, [load]);

  async function act(o: OpenOrder, action: "swap" | "cancel") {
    const to = swapTo[o.id];
    if (action === "swap" && !to) {
      toast({ title: "בחרו זר להחלפה", variant: "error" });
      return;
    }
    if (action === "cancel" && !window.confirm(`לבטל את ההזמנה של ${o.customer_name}?`)) return;
    setBusy(o.id);
    try {
      const res = await api<{ refundDue?: number | null }>("/api/staff/supply/orders", {
        method: "POST",
        json: action === "swap" ? { action, order_id: o.id, from: productId, to } : { action, order_id: o.id },
      });
      toast({
        title:
          action === "swap"
            ? `ההזמנה של ${o.customer_name} עודכנה`
            : res.refundDue
              ? `ההזמנה בוטלה. צריך להחזיר ל${o.customer_name} ${formatILS(res.refundDue)}, וזה מסומן בהזמנות הלקוחות.`
              : `ההזמנה של ${o.customer_name} בוטלה`,
        variant: "success",
      });
      await load();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : T.saveError, variant: "error" });
    } finally {
      setBusy(null);
    }
  }

  if (orders === null) return <p className="mt-2 text-xs text-muted-foreground">בודקים הזמנות של לקוחות…</p>;
  if (orders.length === 0) return <p className="mt-2 text-xs text-muted-foreground">אין הזמנות פתוחות של לקוחות עם &quot;{title}&quot;.</p>;
  const others = products.filter((p) => p.id !== productId);
  return (
    <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-2 dark:bg-amber-950/30">
      <p className="text-sm font-medium">
        {orders.length} הזמנות של לקוחות עם &quot;{title}&quot;. דברו עם הלקוח, ואז החליפו לזר אחר (באותו מחיר) או בטלו.
      </p>
      <ul className="mt-2 space-y-2">
        {orders.map((o) => (
          <li key={o.id} className="rounded-md border bg-background p-2 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="font-medium">
                {o.customer_name} · {o.qty} זרים
              </span>
              <a href={`tel:${o.customer_phone}`} dir="ltr" className="text-primary underline">
                {o.customer_phone}
              </a>
            </div>
            <p className="text-xs text-muted-foreground">
              {o.delivery ? "משלוח" : "איסוף"}
              {o.stall_name ? ` · ${o.stall_name}` : ""} · {o.status === "approved" ? "שולם" : "מחכה לתשלום"}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select
                value={swapTo[o.id] ?? ""}
                onChange={(e) => setSwapTo((m) => ({ ...m, [o.id]: e.target.value }))}
                className="h-10 w-full min-w-0 rounded-md border bg-background px-2 text-sm sm:w-auto sm:flex-1"
                aria-label="זר במקום"
              >
                <option value="">זר במקום…</option>
                {others.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
              <Button size="sm" className="h-10" disabled={busy === o.id} onClick={() => void act(o, "swap")}>
                החלפה
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-10 text-destructive"
                disabled={busy === o.id}
                onClick={() => void act(o, "cancel")}
              >
                ביטול ההזמנה
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A bouquet that exists already but wasn't in this week's order (came anyway). */
function AddExisting({ products, onChanged }: { products: { id: string; title: string }[]; onChanged: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [pid, setPid] = useState("");
  const [qty, setQty] = useState("");
  const [free, setFree] = useState(false);
  const [busy, setBusy] = useState(false);
  if (products.length === 0) return null;

  async function save() {
    const q = Math.floor(Number(qty));
    if (!pid || !(q > 0)) {
      toast({ title: "בחרו זר וכתבו כמה הגיע", variant: "error" });
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ toSplit?: number }>("/api/staff/supply/lines", {
        method: "PATCH",
        json: { product_id: pid, received_qty: q, ...(free ? { free_qty: q, unit_cost: 0 } : {}) },
      });
      toast({ title: res.toSplit ? "נוסף למלאי. אפשר לתת אותו לדוכנים בטבלת החלוקה." : "נוסף למלאי", variant: "success" });
      setFree(false);
      setOpen(false);
      setPid("");
      setQty("");
      onChanged();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : T.saveError, variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  return open ? (
    <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-3">
      <select value={pid} onChange={(e) => setPid(e.target.value)} className="h-11 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm" aria-label="זר">
        <option value="">בחרו זר</option>
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
          </option>
        ))}
      </select>
      <Input type="number" inputMode="numeric" min={1} dir="ltr" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="כמה" className="h-11 w-20 text-center" aria-label="כמה הגיע" />
      <label className="flex h-11 items-center gap-1 text-sm">
        <input type="checkbox" checked={free} onChange={(e) => setFree(e.target.checked)} className="h-4 w-4" />
        בחינם
      </label>
      <Button className="h-11" onClick={() => void save()} disabled={busy}>
        {T.save}
      </Button>
      <Button variant="ghost" className="h-11" onClick={() => setOpen(false)}>
        {T.cancel}
      </Button>
    </div>
  ) : (
    <button type="button" onClick={() => setOpen(true)} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
      <Plus className="h-4 w-4" aria-hidden="true" />
      הגיע זר שלא היה בהזמנה
    </button>
  );
}

/** A brand-new bouquet: sold at the stalls right away, off the website until a manager turns it on. */
function NewBouquet({ onChanged }: { onChanged: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [qty, setQty] = useState("");
  const [busy, setBusy] = useState(false);

  const p = Number(price);
  const c = Number(cost);
  const profit = Number.isFinite(p) && Number.isFinite(c) && price !== "" && cost !== "" ? p - c : null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (title.trim().length < 2 || !(p >= 0) || !(c >= 0) || price === "" || cost === "") {
      toast({ title: "כתבו שם, מחיר מכירה ועלות", variant: "error" });
      return;
    }
    setBusy(true);
    try {
      await api("/api/staff/supply/products", {
        method: "POST",
        json: {
          title: title.trim(),
          description: description.trim() || undefined,
          price_standard: p,
          cost_price: c,
          received_qty: qty ? Math.floor(Number(qty)) : undefined,
        },
      });
      toast({ title: `"${title.trim()}" נוסף. הוא נמכר בדוכנים, ולא מופיע באתר עד שהמנהל יפעיל.`, variant: "success" });
      setOpen(false);
      setTitle("");
      setDescription("");
      setPrice("");
      setCost("");
      setQty("");
      onChanged();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : T.saveError, variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="זר חדש" description="זר שלא קיים עדיין במערכת. הוא לא יופיע באתר עד שהמנהל יפעיל אותו ויוסיף תמונה.">
      {open ? (
        <form onSubmit={save} className="space-y-3">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="שם הזר" className="h-11" aria-label="שם הזר" />
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="תיאור (לא חובה)" className="h-11" aria-label="תיאור" />
          <div className="flex flex-wrap gap-2">
            <label className="text-xs">
              <span className="mb-1 block text-muted-foreground">מחיר מכירה (₪)</span>
              <Input type="number" inputMode="decimal" min={0} dir="ltr" value={price} onChange={(e) => setPrice(e.target.value)} className="h-11 w-28 text-center" />
            </label>
            <label className="text-xs">
              <span className="mb-1 block text-muted-foreground">עלות (₪)</span>
              <Input type="number" inputMode="decimal" min={0} dir="ltr" value={cost} onChange={(e) => setCost(e.target.value)} className="h-11 w-28 text-center" />
            </label>
            <label className="text-xs">
              <span className="mb-1 block text-muted-foreground">כמה הגיעו</span>
              <Input type="number" inputMode="numeric" min={0} dir="ltr" value={qty} onChange={(e) => setQty(e.target.value)} className="h-11 w-24 text-center" />
            </label>
          </div>
          {profit !== null && (
            <p className={cn("text-sm", profit < 0 ? "text-destructive" : "text-primary")}>רווח לזר: {formatILS(profit)}</p>
          )}
          <div className="flex gap-2">
            <Button type="submit" className="h-11" disabled={busy}>
              {busy ? T.saving : "הוספת הזר"}
            </Button>
            <Button type="button" variant="ghost" className="h-11" onClick={() => setOpen(false)}>
              {T.cancel}
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="outline" className="h-11" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          הוספת זר חדש
        </Button>
      )}
    </Card>
  );
}
