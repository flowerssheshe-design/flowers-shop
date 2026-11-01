"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Check, MapPin, Package, Pencil, Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toaster";
import { StaffPageHeader, type ShellEmployee } from "@/components/staff/StaffShell";
import { T } from "@/lib/staff/labels";
import { cn } from "@/lib/utils";
import { OPS } from "@/lib/staff/ops/labels";
import { opsFetch } from "@/lib/staff/ops/client";
import type { EquipmentItem, Stall, StallWithToday } from "@/lib/staff/ops/types";
import { ConfirmDialog, EmptyBlock, ErrorBlock, Field, FormError, FormSheet, LoadingBlock, useOpsData } from "./common";
import { CourierCard, FridayBar, StallFridayStaff, SupplyCard, useFriday } from "./FridayPanel";
import { BudgetPanel } from "./BudgetPanel";
import { StallStockDialog } from "./StallStockDialog";

type StallsResponse = { today: string; stalls: StallWithToday[]; equipment: EquipmentItem[] };

export function StallsView({ me }: { me: ShellEmployee }) {
  const { data, error, loading, reload, setData } = useOpsData<StallsResponse>("/api/staff/stalls", (u) => opsFetch(u));
  const [editing, setEditing] = React.useState<StallWithToday | "new" | null>(null);
  const { toast } = useToast();
  const friday = useFriday();
  const [stocking, setStocking] = React.useState<StallWithToday | null>(null);

  return (
    <div className="space-y-8">
      <StaffPageHeader
        title={T.stalls}
        description="מי עובד בכל דוכן ביום שישי, השליח, התקציב והציוד."
        actions={
          <Button className="h-11 md:h-10" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {OPS.addStall}
          </Button>
        }
      />

      {loading && !data ? (
        <LoadingBlock />
      ) : error && !data ? (
        <ErrorBlock message={error} onRetry={reload} />
      ) : (
        <>
          <FridayBar f={friday} showSupply />

          {data!.stalls.length === 0 ? (
            <EmptyBlock message={OPS.noStalls}>
              <Button variant="outline" onClick={() => setEditing("new")}>
                {OPS.addStall}
              </Button>
            </EmptyBlock>
          ) : (
            <ul className="grid gap-4 lg:grid-cols-2">
              {data!.stalls.map((s) => (
                <li key={s.id} className={cn("rounded-lg border bg-background p-4", !s.is_active && "opacity-70")}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                        {s.name}
                        {!s.is_active && <Badge variant="outline">{OPS.inactive}</Badge>}
                      </p>
                      {s.location && (
                        <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          {s.location}
                        </p>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" aria-label={`${OPS.editStall} ${s.name}`} onClick={() => setEditing(s)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Opened and closed by the stall seller from the stall screen. */}
                  <div
                    className={cn(
                      "mt-3 flex min-h-12 items-center justify-between rounded-md border px-3 py-2",
                      s.is_open ? "border-primary/40 bg-primary/5" : "bg-muted/30",
                    )}
                  >
                    <span className="font-medium">{s.is_open ? OPS.openNow : OPS.closedNow}</span>
                    <span className="text-xs text-muted-foreground">המוכר פותח וסוגר מהמסך שלו</span>
                  </div>

                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    {s.is_active ? (
                      <StallFridayStaff f={friday} stallId={s.id} stallName={s.name} meId={me.id} />
                    ) : (
                      <p className="text-sm text-muted-foreground">דוכן לא פעיל, לא משבצים אליו.</p>
                    )}
                    <div>
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <p className="flex items-center gap-1.5 text-sm font-medium">
                          <Package className="h-4 w-4" aria-hidden="true" />
                          {OPS.todayStock}
                        </p>
                        {s.is_active && (
                          <Button variant="outline" size="sm" className="h-9" onClick={() => setStocking(s)}>
                            <Package className="h-4 w-4" aria-hidden="true" />
                            חלוקת זרים
                          </Button>
                        )}
                      </div>
                      {s.stock.length === 0 ? (
                        <p className="text-sm text-muted-foreground">{OPS.noStockToday}</p>
                      ) : (
                        <ul className="space-y-1 text-sm">
                          {s.stock.map((l) => (
                            <li key={l.product_id} className="flex justify-between gap-2">
                              <span className="truncate">{l.title}</span>
                              <span className="shrink-0 tabular-nums">{l.stock}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <CourierCard f={friday} meId={me.id} />
            <SupplyCard f={friday} meId={me.id} />
          </div>

          {friday.data && <BudgetPanel key={friday.data.weekStart} week={friday.data.weekStart} meId={me.id} />}

          <EquipmentEditor
            items={data!.equipment}
            onChange={(equipment) => setData((d) => (d ? { ...d, equipment } : d))}
          />
        </>
      )}

      {stocking && (
        <StallStockDialog
          stallId={stocking.id}
          stallName={stocking.name}
          onClose={() => setStocking(null)}
          onSaved={reload}
        />
      )}

      {editing && (
        <StallForm
          key={editing === "new" ? "new" : editing.id}
          stall={editing === "new" ? null : editing}
          nextSort={(data?.stalls.reduce((m, s) => Math.max(m, s.sort_order), 0) ?? 0) + 1}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            toast({ title: T.saved, variant: "success" });
            void reload();
          }}
        />
      )}
    </div>
  );
}

function StallForm({
  stall,
  nextSort,
  onClose,
  onSaved,
}: {
  stall: Stall | null;
  nextSort: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = stall === null;
  const [name, setName] = React.useState(stall?.name ?? "");
  const [location, setLocation] = React.useState(stall?.location ?? "");
  const [active, setActive] = React.useState(stall?.is_active ?? true);
  const [sort, setSort] = React.useState(String(stall?.sort_order ?? nextSort));
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (name.trim().length < 2) return setErr("כתבו שם לדוכן");
    const sortNum = Number(sort);
    if (!Number.isInteger(sortNum) || sortNum < 0) return setErr("הסדר צריך להיות מספר שלם 0 ומעלה.");
    setBusy(true);
    try {
      await opsFetch(isNew ? "/api/staff/stalls" : `/api/staff/stalls/${stall!.id}`, {
        method: isNew ? "POST" : "PATCH",
        body: { name: name.trim(), location: location.trim() || null, is_active: active, sort_order: sortNum },
      });
      onSaved();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : T.saveError);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setErr(null);
    try {
      await opsFetch(`/api/staff/stalls/${stall!.id}`, { method: "DELETE" });
      setConfirmDelete(false);
      onSaved();
    } catch (e2) {
      setConfirmDelete(false);
      setErr(e2 instanceof Error ? e2.message : T.saveError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <FormSheet
        open
        onOpenChange={(o) => !o && !busy && onClose()}
        title={isNew ? OPS.addStall : OPS.editStall}
        footer={
          <>
            <Button variant="outline" className="h-11 sm:h-10" onClick={onClose} disabled={busy}>
              {T.cancel}
            </Button>
            <Button className="h-11 sm:h-10" type="submit" form="stall-form" disabled={busy}>
              {busy ? T.saving : T.save}
            </Button>
          </>
        }
      >
        <form id="stall-form" onSubmit={submit} className="space-y-4">
          <Field label={OPS.stallName} htmlFor="stall-name">
            <Input id="stall-name" className="h-11 md:h-10" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={OPS.location} htmlFor="stall-location">
            <Input
              id="stall-location"
              className="h-11 md:h-10"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="למשל: כיכר העירייה"
            />
          </Field>
          <Field label={OPS.sortOrder} htmlFor="stall-sort" hint="מספר קטן מופיע ראשון.">
            <Input
              id="stall-sort"
              className="h-11 md:h-10"
              type="number"
              inputMode="numeric"
              min={0}
              dir="ltr"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            />
          </Field>
          <label className="flex min-h-11 items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
            <span>
              {OPS.active}
              <span className="block text-xs text-muted-foreground">דוכן לא פעיל לא מופיע בשיבוץ ובמכירה.</span>
            </span>
            <Switch checked={active} onCheckedChange={setActive} />
          </label>
          <FormError message={err} />
          {!isNew && (
            <Button
              type="button"
              variant="ghost"
              className="h-11 w-full text-destructive hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              מחיקת הדוכן
            </Button>
          )}
        </form>
      </FormSheet>
      <ConfirmDialog
        open={confirmDelete}
        title={OPS.deleteStallConfirm}
        description="אם כבר היו בדוכן משמרות או מכירות, אי אפשר למחוק אותו. אפשר להפוך אותו ללא פעיל."
        confirmLabel={T.delete}
        busy={busy}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}

function EquipmentEditor({ items, onChange }: { items: EquipmentItem[]; onChange: (items: EquipmentItem[]) => void }) {
  const [newName, setNewName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [editId, setEditId] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState("");
  const { toast } = useToast();

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : T.saveError, variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    void run(async () => {
      const res = await opsFetch<{ item: EquipmentItem }>("/api/staff/stalls/equipment", {
        method: "POST",
        body: { name: newName.trim() },
      });
      onChange([...items, res.item]);
      setNewName("");
    });
  };

  const patch = (item: EquipmentItem, body: Partial<Pick<EquipmentItem, "name" | "is_active">>) =>
    run(async () => {
      const res = await opsFetch<{ item: EquipmentItem }>(`/api/staff/stalls/equipment/${item.id}`, { method: "PATCH", body });
      onChange(items.map((x) => (x.id === item.id ? res.item : x)));
      setEditId(null);
    });

  const move = (index: number, dir: -1 | 1) =>
    run(async () => {
      const order = items.map((x) => x.id);
      const j = index + dir;
      if (j < 0 || j >= order.length) return;
      [order[index], order[j]] = [order[j], order[index]];
      const res = await opsFetch<{ equipment: EquipmentItem[] }>("/api/staff/stalls/equipment", {
        method: "PUT",
        body: { order },
      });
      onChange(res.equipment);
    });

  return (
    <section className="rounded-lg border bg-background p-4">
      <h2 className="text-lg font-semibold">{OPS.equipment}</h2>
      <p className="mb-3 text-sm text-muted-foreground">{OPS.equipmentHint}</p>

      {items.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">אין פריטים ברשימה.</p>
      ) : (
        <ul className="divide-y">
          {items.map((item, i) => (
            <li key={item.id} className="flex flex-wrap items-center gap-2 py-2">
              {editId === item.id ? (
                <form
                  className="flex flex-1 items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (editName.trim()) void patch(item, { name: editName.trim() });
                  }}
                >
                  <Input
                    className="h-11 md:h-10"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    autoFocus
                    aria-label={OPS.itemName}
                  />
                  <Button type="submit" size="icon" disabled={busy} aria-label={T.save}>
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setEditId(null)}>
                    {T.cancel}
                  </Button>
                </form>
              ) : (
                <>
                  <span className={cn("min-w-0 flex-1 truncate", !item.is_active && "text-muted-foreground line-through")}>
                    {item.name}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label="הזזה למעלה">
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={busy || i === items.length - 1}
                      onClick={() => move(i, 1)}
                      aria-label="הזזה למטה"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={busy}
                      onClick={() => {
                        setEditId(item.id);
                        setEditName(item.name);
                      }}
                      aria-label={`${T.edit} ${item.name}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Switch
                      checked={item.is_active}
                      disabled={busy}
                      onCheckedChange={(v) => patch(item, { is_active: v })}
                      aria-label={`${OPS.active}: ${item.name}`}
                    />
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="mt-3 flex gap-2">
        <Input
          className="h-11 md:h-10"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={OPS.itemName}
          aria-label={OPS.itemName}
        />
        <Button type="submit" className="h-11 shrink-0 md:h-10" disabled={busy || !newName.trim()}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {OPS.addItem}
        </Button>
      </form>
    </section>
  );
}
