"use client";

import { useEffect, useState } from "react";
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
  cost_price?: number;
};

/**
 * "מה הגיע": the supply runner writes how many of each bouquet really came and
 * what was paid per bouquet. The stock and the supplier cost follow.
 */
export function SupplyReceipts({
  lines,
  products,
  isForecast,
  onChanged,
}: {
  lines: ReceiptLine[];
  products: { id: string; title: string }[];
  isForecast: boolean;
  onChanged: () => void;
}) {
  return (
    <div className="space-y-4">
      <Card title="מה הגיע מהספק" description="כמה הגיע בפועל וכמה שילמתם לכל זר. המלאי באתר ועלות הספק מתעדכנים לפי זה.">
        {isForecast ? (
          <EmptyBlock text="ההזמנה מהספק עוד לא נשלחה. אחרי שהיא נשלחת אפשר לעדכן כאן מה הגיע." />
        ) : lines.length === 0 ? (
          <EmptyBlock text="אין שורות בהזמנה מהספק השבוע." />
        ) : (
          <ul className="space-y-2">
            {lines.map((l) => (
              <ReceiptRow key={l.product_id} line={l} onChanged={onChanged} />
            ))}
          </ul>
        )}
        {!isForecast && <AddExisting products={products.filter((p) => !lines.some((l) => l.product_id === p.id))} onChanged={onChanged} />}
      </Card>
      <NewBouquet onChanged={onChanged} />
    </div>
  );
}

function ReceiptRow({ line, onChanged }: { line: ReceiptLine; onChanged: () => void }) {
  const { toast } = useToast();
  const got = line.received_qty ?? line.qty;
  const price = line.unit_cost ?? line.cost_price ?? 0;
  const [qty, setQty] = useState(String(got));
  const [cost, setCost] = useState(String(price));
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setQty(String(got));
    setCost(String(price));
  }, [got, price]);

  const dirty = Number(qty) !== got || Number(cost) !== price;

  async function save() {
    const q = Math.floor(Number(qty));
    const c = Number(cost);
    if (!Number.isFinite(q) || q < 0 || !Number.isFinite(c) || c < 0) {
      toast({ title: "כתבו מספרים, 0 או יותר", variant: "error" });
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = { product_id: line.product_id };
      if (q !== got) body.received_qty = q;
      if (c !== price) body.unit_cost = c;
      const res = await api<{ splitReset?: boolean }>("/api/staff/supply/lines", { method: "PATCH", json: body });
      toast({
        title: res.splitReset ? `${line.title}: נשמר. החלוקה בין הדוכנים בוטלה, והמנהל קיבל הודעה לחלק מחדש.` : `${line.title}: נשמר`,
        variant: "success",
      });
      onChanged();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : T.saveError, variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  const diff = Number(qty) - line.qty;
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
      <p className="mt-1 text-xs text-muted-foreground">סה״כ לספק: {formatILS((Number(qty) || 0) * (Number(cost) || 0))}</p>
    </li>
  );
}

/** A bouquet that exists already but wasn't in this week's order (came anyway). */
function AddExisting({ products, onChanged }: { products: { id: string; title: string }[]; onChanged: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [pid, setPid] = useState("");
  const [qty, setQty] = useState("");
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
      const res = await api<{ splitReset?: boolean }>("/api/staff/supply/lines", { method: "PATCH", json: { product_id: pid, received_qty: q } });
      toast({ title: res.splitReset ? "נוסף למלאי. החלוקה בין הדוכנים בוטלה, והמנהל קיבל הודעה לחלק מחדש." : "נוסף למלאי", variant: "success" });
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
