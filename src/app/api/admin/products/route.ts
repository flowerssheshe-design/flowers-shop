import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED } from "@/lib/constants";
import { requireAdmin } from "@/lib/admin-auth";
import type { Product } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const denied = requireAdmin();
  if (denied) return denied;
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json({ products: [] });
  }
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) {
      return NextResponse.json(
        { error: "טעינת מוצרים נכשלה" },
        { status: 500 },
      );
    }
    return NextResponse.json({ products: (data as Product[]) ?? [] });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}

const ImageUrlSchema = z.string().url().max(2000);
const ImageUrlsSchema = z.array(ImageUrlSchema).max(10);

const ProductSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
  price_standard: z.number().min(0).max(100000),
  price_member: z.number().min(0).max(100000),
  cost_price: z.number().min(0).max(100000),
  image_url: ImageUrlSchema.nullish(),
  image_urls: ImageUrlsSchema.optional(),
  is_active: z.boolean(),
  sort_order: z.number().int().min(0).max(10000),
});

function normalizeImages(
  data: z.infer<typeof ProductSchema>,
): Partial<z.infer<typeof ProductSchema>> {
  if (data.image_urls === undefined && data.image_url === undefined) {
    return {};
  }
  const imageUrls = data.image_urls ?? (data.image_url ? [data.image_url] : []);
  return {
    image_urls: imageUrls,
    image_url: imageUrls[0] ?? null,
  };
}

export async function POST(req: Request) {
  const denied = requireAdmin();
  if (denied) return denied;
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json({ error: "המערכת אינה מוגדרת" }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  const parsed = ProductSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "נתונים לא תקינים", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("products")
      .insert({ ...parsed.data, ...normalizeImages(parsed.data) })
      .select("*")
      .single();
    if (error || !data) {
      return NextResponse.json(
        { error: "יצירת המוצר נכשלה" },
        { status: 500 },
      );
    }
    return NextResponse.json({ product: data as Product }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}