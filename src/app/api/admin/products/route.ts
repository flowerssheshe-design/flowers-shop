import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_CONFIGURED } from "@/lib/constants";
import type { Product } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json({ products: [] });
  }
  try {
    const supabase = await createClient();
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

const ProductSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
  price_standard: z.number().min(0).max(100000),
  price_member: z.number().min(0).max(100000),
  image_url: z.string().url().max(2000).nullish(),
  is_active: z.boolean(),
  sort_order: z.number().int().min(0).max(10000),
});

export async function POST(req: Request) {
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
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("products")
      .insert(parsed.data)
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