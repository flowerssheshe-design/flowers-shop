"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ImagePlus, Loader2, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { ImageCarousel } from "@/components/ImageCarousel";
import { SUPABASE_CONFIGURED } from "@/lib/constants";
import { calculateMemberPrice, calculateDiscountAmount, formatILS, generateUUID } from "@/lib/utils";
import { useSystemSettings } from "@/lib/useSystemSettings";
import type { Product } from "@/types";

type Props = {
  mode: "create" | "edit";
  initial?: Product & { default_order_qty?: number | null };
  nextSortOrder?: number;
  /** Where "back" and "after save" go. Defaults to the old admin list. */
  backHref?: string;
  /** Render without the page header/background (inside the staff shell). */
  embedded?: boolean;
  /** Show and save "default qty for the supplier order" (staff area only). */
  withDefaultOrderQty?: boolean;
};

export function ProductForm({
  mode,
  initial,
  nextSortOrder = 0,
  backHref = "/admin/products",
  embedded = false,
  withDefaultOrderQty = false,
}: Props) {
  const router = useRouter();
  const memberPercent = Number(useSystemSettings().member_discount_percent) || 0;
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [priceStandard, setPriceStandard] = useState(
    initial?.price_standard ?? 0,
  );
  const [costPrice, setCostPrice] = useState(
    initial?.cost_price ?? 0,
  );
  const [imageUrls, setImageUrls] = useState<string[]>(
    initial?.image_urls?.length
      ? initial.image_urls
      : initial?.image_url
        ? [initial.image_url]
        : [],
  );
  const [imageUrlInput, setImageUrlInput] = useState("");
  const [previewIndex, setPreviewIndex] = useState(0);
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [sortOrder, setSortOrder] = useState(
    initial?.sort_order ?? nextSortOrder,
  );
  const [defaultOrderQty, setDefaultOrderQty] = useState<string>(
    String(initial?.default_order_qty ?? 0),
  );
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!initial && mode === "edit") {
      router.replace(backHref);
    }
  }, [initial, mode, router, backHref]);

  // Keep the preview on the first slide whenever the gallery changes.
  useEffect(() => {
    setPreviewIndex(0);
  }, [imageUrls]);

  const priceMember = calculateMemberPrice(priceStandard, memberPercent);
  const discountAmount = calculateDiscountAmount(priceStandard, memberPercent);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    if (!SUPABASE_CONFIGURED) {
      setError("העלאת תמונות לא זמינה כרגע (המערכת לא מחוברת לאחסון).");
      return;
    }
    if (imageUrls.length + files.length > 10) {
      setError("אפשר להוסיף עד 10 תמונות לזר.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const supabase = createClient();
      const uploadedUrls: string[] = [];
      for (const file of files) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `products/${generateUUID()}.${ext}`;
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
        uploadedUrls.push(data.publicUrl);
      }
      setImageUrls((current) => [...current, ...uploadedUrls]);
    } catch (err) {
      setError(
        err instanceof Error
          ? `ההעלאה נכשלה: ${err.message}`
          : "ההעלאה נכשלה. נסו שוב.",
      );
    } finally {
      setUploading(false);
    }
  }

  function addImageUrl() {
    const url = imageUrlInput.trim();
    if (!url) return;
    if (!imageUrls.includes(url)) {
      setImageUrls((current) => [...current, url]);
    }
    setImageUrlInput("");
  }

  function removeImageUrl(index: number) {
    setImageUrls((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const qty = Number(defaultOrderQty);
    if (withDefaultOrderQty && (!Number.isInteger(qty) || qty < 0)) {
      setError("כמות ברירת המחדל להזמנה מהספק חייבת להיות מספר שלם, 0 ומעלה.");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        price_standard: Number(priceStandard),
        price_member: Number(priceMember),
        cost_price: Number(costPrice),
        image_url: imageUrls[0] ?? null,
        image_urls: imageUrls,
        is_active: isActive,
        sort_order: Number(sortOrder),
      };

      let res: Response;
      let productId: string | undefined = initial?.id;
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
          throw new Error("השמירה נכשלה. בדקו את הפרטים ונסו שוב.");
        }
        productId = created?.product?.id;
      } else if (initial) {
        res = await fetch(`/api/admin/products/${initial.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const t = await res.json().catch(() => ({}));
          throw new Error(t.error ?? "השמירה נכשלה. בדקו את הפרטים ונסו שוב.");
        }
      } else {
        throw new Error("חסרים פרטי המוצר.");
      }

      // default_order_qty is saved through the staff API (the admin product API ignores it).
      if (withDefaultOrderQty && productId && qty !== Number(initial?.default_order_qty ?? 0)) {
        const r = await fetch("/api/staff/supplier/defaults", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: [{ product_id: productId, default_order_qty: qty }] }),
        });
        if (!r.ok) {
          throw new Error("הזר נשמר, אבל כמות ברירת המחדל לספק לא נשמרה. נסו לשמור שוב.");
        }
      }

      router.push(backHref);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "השמירה נכשלה. נסו שוב.");
    } finally {
      setSubmitting(false);
    }
  }

  const formBody = (
      <form onSubmit={submit} className={embedded ? "max-w-xl space-y-4" : "container max-w-xl space-y-4 py-4"}>
        <div>
          <Label htmlFor="title">שם הזר</Label>
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
          <Label htmlFor="ps">מחיר (₪)</Label>
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
             (הנחה של {memberPercent}%, חיסכון של{" "}
             {priceStandard > 0 ? formatILS(discountAmount) : "—"})
           </div>
          </div>

           <div className="space-y-2 rounded-lg border p-3">
             <Label htmlFor="cp">מחיר קנייה מהספק (₪)</Label>
             <Input
               id="cp"
               type="number"
               min={0}
               step="0.01"
               value={costPrice}
               onChange={(e) => setCostPrice(Number(e.target.value))}
             />
           </div>

           {withDefaultOrderQty && (
             <div className="space-y-2 rounded-lg border p-3">
               <Label htmlFor="doq">כמות ברירת מחדל להזמנה מהספק</Label>
               <Input
                 id="doq"
                 type="number"
                 inputMode="numeric"
                 min={0}
                 step={1}
                 value={defaultOrderQty}
                 onChange={(e) => setDefaultOrderQty(e.target.value)}
               />
               <p className="text-xs text-muted-foreground">
                 כמה להזמין כל שבוע מעבר להזמנות מראש. אפשר לשנות בכל שבוע במסך ההזמנה מהספק.
               </p>
             </div>
           )}

           <div className="space-y-3 rounded-lg border p-3">
             <div className="flex items-center justify-between">
               <Label>תמונות</Label>
               <span className="text-xs text-muted-foreground">
                 {imageUrls.length}/10
               </span>
             </div>
             <p className="text-xs text-muted-foreground">
               התמונה הראשונה היא התמונה הראשית בחנות.
             </p>
              <div className="relative overflow-hidden rounded-md">
                <ImageCarousel
                  images={imageUrls}
                  alt="תצוגה מקדימה"
                  sizes="(max-width: 640px) 100vw, 50vw"
                  priority
                  index={Math.min(previewIndex, Math.max(0, imageUrls.length - 1))}
                  onIndexChange={setPreviewIndex}
                  resetKey={imageUrls.join("|")}
                />
              </div>
              {imageUrls.length > 1 && (
                <div className="grid grid-cols-5 gap-2">
                  {imageUrls.map((url, index) => (
                    <div
                      key={`${url}-${index}`}
                      className="relative aspect-square overflow-hidden rounded-md bg-muted"
                    >
                      <Image
                        src={url}
                        alt={`תמונה ${index + 1}`}
                        fill
                        sizes="100px"
                        className="object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          removeImageUrl(index);
                        }}
                        aria-label={`הסרת תמונה ${index + 1}`}
                        className="absolute end-1 top-1 rounded-full bg-background/90 p-1 text-destructive shadow-sm"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewIndex(index)}
                        aria-label={`הצגת תמונה ${index + 1}`}
                        aria-current={index === previewIndex ? "true" : undefined}
                        className={`absolute inset-0 rounded-md transition-opacity duration-200 ease-out ${
                          index === previewIndex
                            ? "ring-2 ring-primary ring-inset"
                            : "hover:bg-primary/10"
                        }`}
                      />
                    </div>
                  ))}
                </div>
              )}
             <div>
               <Label htmlFor="url" className="text-xs">
                 או הדביקו קישור לתמונה
               </Label>
               <div className="flex gap-2">
                 <Input
                   id="url"
                   type="url"
                   value={imageUrlInput}
                   onChange={(e) => setImageUrlInput(e.target.value)}
                   placeholder="https://…"
                   dir="ltr"
                   disabled={imageUrls.length >= 10 || uploading}
                 />
                 <Button
                   type="button"
                   variant="outline"
                   onClick={addImageUrl}
                   disabled={!imageUrlInput.trim() || imageUrls.length >= 10 || uploading}
                 >
                   הוספה
                 </Button>
               </div>
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
                 {uploading ? "מעלה…" : "העלאת תמונות"}
               </Label>
               <Input
                 id="file"
                 type="file"
                 accept="image/*"
                 multiple
                 className="hidden"
                 onChange={handleFile}
                 disabled={uploading}
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
          {mode === "create" ? "יצירת הזר" : "שמירת השינויים"}
        </Button>
      </form>
  );

  if (embedded) return formBody;

  return (
    <main className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container flex items-center justify-between py-3">
          <h1 className="text-lg font-bold">
            {mode === "create" ? "זר חדש" : `עריכה: ${initial?.title ?? ""}`}
          </h1>
          <Button asChild variant="ghost" size="sm">
            <Link href={backHref}>
              <ArrowRight className="h-4 w-4" />
              חזרה
            </Link>
          </Button>
        </div>
      </header>
      {formBody}
    </main>
  );
}