import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED } from "@/lib/constants";
import { requireAdmin } from "@/lib/admin-auth";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const SettingsSchema = z.object({
  delivery_fee: z.number().min(0).optional(),
  club_discount_threshold: z.number().min(0).optional(),
  member_discount_percent: z.number().min(0).max(100).optional(),
  bit_number: z.string().optional(),
  paybox_number: z.string().optional(),
  whatsapp_number: z.string().optional(),
  business_phone: z.string().optional(),
  contact_phone: z.string().optional(),
  business_email: z.string().optional(),
  pickup_address: z.string().optional(),
  pickup_instructions: z.string().optional(),
  pickup_hours: z.string().optional(),
  business_hours: z.string().optional(),
  preorder_deadline: z.string().optional(),
  same_day_deadline: z.string().optional(),
  announcement_banner_text: z.string().optional(),
  is_stall_open: z.boolean().optional(),
});

export async function GET() {
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json({ settings: {} });
  }
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("system_settings")
      .select("key, value");

    if (error) {
      console.error("System settings GET error:", error);
      return NextResponse.json({ settings: {} }, { status: 200 });
    }

    const settings: Record<string, unknown> = {};
    for (const row of data ?? []) {
      settings[row.key] = row.value;
    }
    return NextResponse.json({ settings });
  } catch (e) {
    console.error("Get system settings exception:", e);
    return NextResponse.json({ settings: {} }, { status: 200 });
  }
}

export async function POST(req: Request) {
  const denied = requireAdmin();
  if (denied) return denied;

  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json(
      { error: "System not configured" },
      { status: 503 }
    );
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = SettingsSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid settings", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const settings = parsed.data;
  const now = new Date().toISOString();

  try {
    const admin = createAdminClient();
    const upserts = Object.entries(settings).map(([key, value]) => ({
      key,
      value,
      updated_at: now,
    }));

    if (upserts.length === 0) {
      return NextResponse.json({ ok: true });
    }

    const { error } = await admin
      .from("system_settings")
      .upsert(upserts, { onConflict: "key" });

    if (error) {
      console.error("System settings upsert error:", error);
      return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Set system settings exception:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}