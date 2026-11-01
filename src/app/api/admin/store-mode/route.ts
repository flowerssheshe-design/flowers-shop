import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED } from "@/lib/constants";
import { requireAdmin } from "@/lib/admin-auth";
import { getStoreMode } from "@/lib/storeMode";
import { autoMarkSupplierOrderIfDue } from "@/lib/staff/owner/supplier-server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const StoreModeSchema = z.object({
  mode: z.enum(["preorder", "realtime"]),
});

const StallOpenSchema = z.object({
  stall_open: z.boolean(),
});

export async function GET() {
  if (!SUPABASE_CONFIGURED) {
    console.warn("Supabase not configured, returning default preorder mode");
    return NextResponse.json({ mode: "preorder", stall_open: false });
  }
  try {
    const admin = createAdminClient();
    // At the supplier-order time, mark the order as sent if nobody did, so the
    // website has live stock the moment it switches to live sale.
    await autoMarkSupplierOrderIfDue(admin);
    // Mode follows the business week ('auto') unless manually overridden.
    const [mode, stallRes, openStallsRes] = await Promise.all([
      getStoreMode(),
      admin.from("system_settings").select("value").eq("key", "is_stall_open").single(),
      admin.from("stalls").select("id", { count: "exact", head: true }).eq("is_open", true).eq("is_active", true),
    ]);

    // The stall sellers open and close their stalls from the staff stall
    // screen; the old global flag is only a fallback before migration 031.
    if (!openStallsRes.error) {
      return NextResponse.json({ mode, stall_open: (openStallsRes.count ?? 0) > 0 });
    }

    let stall_open = false;
    if (!stallRes.error && stallRes.data) {
      const stallValue = stallRes.data.value;
      stall_open = stallValue === true || stallValue === "true";
    } else if (stallRes.error) {
      // Fallback to store_settings.stall_open for backward compatibility
      const legacyStallRes = await admin
        .from("store_settings")
        .select("value")
        .eq("key", "stall_open")
        .single();
      if (!legacyStallRes.error && legacyStallRes.data) {
        const stallValue = legacyStallRes.data.value;
        stall_open = stallValue === true || stallValue === "true";
      }
    }

    return NextResponse.json({ mode, stall_open });
  } catch (e) {
    console.error("Get store mode exception:", e);
    return NextResponse.json({ mode: "preorder", stall_open: false }, { status: 200 });
  }
}

export async function POST(req: Request) {
  const denied = requireAdmin();
  if (denied) return denied;

  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json(
      { error: "המערכת אינה מוגדרת כרגע" },
      { status: 503 }
    );
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "גוף הבקשה אינו תקין" }, { status: 400 });
  }

  // Try parsing as stall_open first, then as mode
  const stallParsed = StallOpenSchema.safeParse(payload);
  if (stallParsed.success) {
    const { stall_open } = stallParsed.data;
    try {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("system_settings")
        .upsert({ key: "is_stall_open", value: stall_open, updated_at: new Date().toISOString() }, { onConflict: "key" })
        .select("value")
        .single();

      if (error || !data) {
        console.error("Stall open upsert error:", error);
        return NextResponse.json({ error: "שגיאה בעדכון סטטוס דוכן" }, { status: 500 });
      }

      const savedStallOpen = data.value as boolean;
      return NextResponse.json({ stall_open: savedStallOpen });
    } catch (e) {
      console.error("Set stall open exception:", e);
      return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
    }
  }

  const parsed = StoreModeSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "מצב חנות לא תקין", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { mode } = parsed.data;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("store_settings")
      .upsert({ key: "mode", value: mode, updated_at: new Date().toISOString() }, { onConflict: "key" })
      .select("value")
      .single();

    if (error || !data) {
      console.error("Store mode upsert error:", error);
      return NextResponse.json({ error: "שגיאה בעדכון מצב החנות" }, { status: 500 });
    }

    const savedMode = data.value as string;
    return NextResponse.json({ mode: savedMode });
  } catch (e) {
    console.error("Set store mode exception:", e);
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}