"use client";

import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { api, formatTime } from "@/lib/staff/work/client";
import { W } from "@/lib/staff/work/labels";
import { Card, EmptyBlock } from "./common";
import type { Checklist } from "./stall-types";

/** Opening or closing equipment check of the stall, saved per day. */
export function ChecklistCard({
  kind,
  stallId,
  items,
  saved,
  onSaved,
}: {
  kind: "open" | "close";
  stallId: string;
  items: { id: string; name: string }[];
  saved: Checklist;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [checked, setChecked] = useState<Set<string>>(new Set(saved?.checked_item_ids ?? []));
  const [notes, setNotes] = useState(saved?.notes ?? "");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Follow the server (polling) until the worker starts changing things.
  useEffect(() => {
    if (dirty) return;
    setChecked(new Set(saved?.checked_item_ids ?? []));
    setNotes(saved?.notes ?? "");
  }, [saved, dirty]);

  function toggle(id: string) {
    setDirty(true);
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      await api("/api/staff/stall/checklist", {
        method: "POST",
        json: { stall_id: stallId, kind, checked_item_ids: Array.from(checked), notes: notes.trim() || null },
      });
      toast({ title: W.checklistSaved, variant: "success" });
      setDirty(false);
      onSaved();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : W.checklistSave, variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  const title = kind === "open" ? W.checklistOpen : W.checklistClose;
  const allChecked = items.length > 0 && items.every((i) => checked.has(i.id));

  return (
    <Card
      title={title}
      actions={
        saved && !dirty ? (
          <span className="inline-flex items-center gap-1 text-sm text-primary">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            {W.checklistDone} {formatTime(saved.created_at)}
          </span>
        ) : null
      }
    >
      {items.length === 0 ? (
        <EmptyBlock text={W.noEquipment} />
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const on = checked.has(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => toggle(item.id)}
                aria-pressed={on}
                className={cn(
                  "flex min-h-[52px] w-full items-center gap-3 rounded-lg border px-3 text-start text-base",
                  on ? "border-primary bg-primary/10" : "bg-background",
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded border",
                    on ? "border-primary bg-primary text-primary-foreground" : "border-input",
                  )}
                  aria-hidden="true"
                >
                  {on && "✓"}
                </span>
                {item.name}
              </button>
            );
          })}
          <textarea
            value={notes}
            onChange={(e) => {
              setDirty(true);
              setNotes(e.target.value);
            }}
            placeholder="הערות (למשל: חסרות שקיות)"
            maxLength={500}
            rows={2}
            className="w-full rounded-md border border-input bg-background p-3 text-sm"
          />
          <Button
            className="h-12 w-full text-base"
            onClick={() => void save()}
            disabled={saving}
            variant={allChecked ? "default" : "outline"}
          >
            {saving ? "שומר…" : W.checklistSave}
          </Button>
        </div>
      )}
    </Card>
  );
}
