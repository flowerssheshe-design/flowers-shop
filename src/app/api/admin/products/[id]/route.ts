import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED } from "@/lib/constants";
import { requireAdmin } from "@/lib/admin-auth";
import type { Product } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const ImageUrlSchema = z.string().url().max(2000);
const ImageUrlsSchema = z.array(ImageUrlSchema).max(10);

const PatchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullish(),
  price_standard: z.number().min(0).max(100000).optional(),
  price_member: z.number().min(0).max(100000).optional(),
  cost_price: z.number().min(0).max(100000).optional(),
  image_url: ImageUrlSchema.nullish(),
  image_urls: ImageUrlsSchema.optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(10000).optional(),
});

function normalizeImages(
  data: z.infer<typeof PatchSchema>,
): Partial<z.infer<typeof PatchSchema>> {
  if (data.image_urls === undefined && data.image_url === undefined) {
    return {};
  }
  const imageUrls = data.image_urls ?? (data.image_url ? [data.image_url] : []);
  return {
    image_urls: imageUrls,
    image_url: imageUrls[0] ?? null,
  };
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const denied = requireAdmin();
  if (denied) return denied;
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json({ error: "המערכת אינה מוגדרת" }, { status: 503 });
  }
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("id", id)
      .single();
    if (error || !data) {
      return NextResponse.json({ error: "מוצר לא נמצא" }, { status: 404 });
    }
    return NextResponse.json({ product: data as Product });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const denied = requireAdmin();
  if (denied) return denied;
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json({ error: "המערכת אינה מוגדרת" }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "נתונים לא תקינים" },
      { status: 400 },
    );
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("products")
      .update({ ...parsed.data, ...normalizeImages(parsed.data) })
      .eq("id", id)
      .select("*")
      .single();
    if (error || !data) {
      return NextResponse.json(
        { error: "עדכון המוצר נכשל" },
        { status: 500 },
      );
    }
    return NextResponse.json({ product: data as Product });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const denied = requireAdmin();
  if (denied) return denied;
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json({ error: "המערכת אינה מוגדרת" }, { status: 503 });
  }
  try {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("products")
      .delete()
      .eq("id", id);
    if (error) {
      return NextResponse.json(
        { error: "מחיקת המוצר נכשלה" },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}