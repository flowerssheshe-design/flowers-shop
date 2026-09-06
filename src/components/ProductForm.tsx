"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ImagePlus, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { SUPABASE_CONFIGURED, MEMBER_DISCOUNT_PERCENT } from "@/lib/constants";
import { calculateMemberPrice, calculateDiscountAmount, formatILS } from "@/lib/utils";
import type { Product } from "@/types";

type Props = {
  mode: "create" | "edit";
  initial?: Product;
  nextSortOrder?: number;
};

const FALLBACK =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'><rect width='400' height='300' fill='%23f3f4f6'/><text x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%239ca3af' font-family='Heebo,sans-serif' font-size='24'>פרחים</text></svg>";

export function ProductForm({ mode, initial, nextSortOrder = 0 }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [priceStandard, setPriceStandard] = useState(
    initial?.price_standard ?? 0,
  );
  const [costPrice, setCostPrice] = useState(
    initial?.cost_price ?? 0,
  );
  const [imageUrl, setImageUrl] = useState(initial?.image_url ?? "");
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [sortOrder, setSortOrder] = useState(
    initial?.sort_order ?? nextSortOrder,
  );
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!initial && mode === "edit") {
      router.replace("/admin/products");
    }
  }, [initial, mode, router]);

  const priceMember = calculateMemberPrice(priceStandard, MEMBER_DISCOUNT_PERCENT);
  const discountAmount = calculateDiscountAmount(priceStandard, MEMBER_DISCOUNT_PERCENT);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!SUPABASE_CONFIGURED) {
      setError("העלאת תמונות אינה זמינה — חסרים משתני סביבה");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() || "jpg";
      const path = `products/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("product-images")
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type,
        });
      if (upErr) throw upErr;
      const { data } = supabase.storage
        .from("product-images")
        .getPublicUrl(path);
      setImageUrl(data.publicUrl);
    } catch (err) {
      setError(
        err instanceof Error
          ? `העלאה נכשלה: ${err.message}`
          : "העלאה נכשלה",
      );
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        price_standard: Number(priceStandard),
        price_member: Number(priceMember),
        cost_price: Number(costPrice),
        image_url: imageUrl.trim() || null,
        is_active: isActive,
        sort_order: Number(sortOrder),
      };

      let res: Response;
      if (mode === "create") {
        res = await fetch("/api/admin/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const created = (res.ok
          ? await res.json().catch(() => null)
          : null) as { product?: { id: string } } | null;
        if (!res.ok) {
          const t = await res.json().catch(() => ({}));
          throw new Error(t.error ?? "שמירה נכשלה");
        }
      } else if (initial) {
        res = await fetch(`/api/admin/products/${initial.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const t = await res.json().catch(() => ({}));
          throw new Error(t.error ?? "שמירה נכשלה");
        }
      } else {
        throw new Error("חסרים נתוני מוצר");
      }

      router.push("/admin/products");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container flex items-center justify-between py-3">
          <h1 className="text-lg font-bold">
            {mode === "create" ? "מוצר חדש" : `עריכה: ${initial?.title ?? ""}`}
          </h1>
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/products">
              <ArrowRight className="h-4 w-4" />
              חזרה
            </Link>
          </Button>
        </div>
      </header>

      <form onSubmit={submit} className="container max-w-xl space-y-4 py-4">
        <div>
          <Label htmlFor="title">שם המוצר</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>

        <div>
          <Label htmlFor="desc">תיאור</Label>
          <Textarea
            id="desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </div>

        <div className="space-y-2 rounded-lg border p-3">
          <Label htmlFor="ps">מחיר ליחידה</Label>
          <Input
            id="ps"
            type="number"
            min={0}
            step="0.01"
            value={priceStandard}
            onChange={(e) => setPriceStandard(Number(e.target.value))}
            required
          />
           <div className="text-xs text-muted-foreground">
             מחיר לקוח קבוע:{" "}
             <span className="font-medium text-foreground">
               {priceStandard > 0 ? formatILS(priceMember) : "—"}
             </span>{" "}
             (הנחה של {MEMBER_DISCOUNT_PERCENT}% — חיסכון{" "}
             {priceStandard > 0 ? formatILS(discountAmount) : "—"})
           </div>
          </div>

           <div className="space-y-2 rounded-lg border p-3">
             <Label htmlFor="cp">מחיר עלות לספק (₪)</Label>
             <Input
               id="cp"
               type="number"
               min={0}
               step="0.01"
               value={costPrice}
               onChange={(e) => setCostPrice(Number(e.target.value))}
             />
           </div>

           <div className="space-y-2 rounded-lg border p-3">
             <Label>תמונה</Label>
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md bg-muted">
            <Image
              src={imageUrl || FALLBACK}
              alt="תצוגה מקדימה"
              fill
              sizes="(max-width: 640px) 100vw, 50vw"
              className="object-cover"
              unoptimized={!imageUrl}
            />
          </div>
          <div>
            <Label htmlFor="url" className="text-xs">
              או הדביקו קישור לתמונה
            </Label>
            <Input
              id="url"
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://…"
              dir="ltr"
            />
          </div>
          <div>
            <Label
              htmlFor="file"
              className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm hover:bg-muted"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ImagePlus className="h-4 w-4" />
              )}
              {uploading ? "מעלה…" : "העלאת קובץ מהמחשב"}
            </Label>
            <Input
              id="file"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFile}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center justify-between rounded-md border p-3">
            <Label htmlFor="active">פעיל בחנות</Label>
            <Switch
              id="active"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
          </div>
          <div>
            <Label htmlFor="so">סדר תצוגה</Label>
            <Input
              id="so"
              type="number"
              min={0}
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
            />
          </div>
        </div>

        {error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" className="w-full" disabled={submitting}>
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {mode === "create" ? "צור מוצר" : "שמור שינויים"}
        </Button>
      </form>
    </main>
  );
}