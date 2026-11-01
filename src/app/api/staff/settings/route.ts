import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/staff/guard";
import { getServerSettings } from "@/lib/settings-server";
import { getStoreModeInfo } from "@/lib/storeMode";
import { SettingsPostSchema, weekTimesValid } from "@/lib/staff/owner/settings-schema";
import { badRequest, notConfigured, readJson, serverError } from "@/lib/staff/owner/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function snapshot() {
  const [settings, info] = await Promise.all([getServerSettings(), getStoreModeInfo()]);
  return {
    settings,
    storeMode: {
      setting: info.setting,
      mode: info.mode,
      phase: info.week.phase,
      supplierOrderAt: info.week.supplierOrderAt.toISOString(),
      closesAt: info.week.closesAt.toISOString(),
    },
  };
}

export async function GET() {
  const guard = await requireStaff("settings");
  if (!guard.ok) return guard.response;
  try {
    return NextResponse.json(await snapshot());
  } catch (e) {
    return serverError("settings", e);
  }
}

/** Body: { settings?: {...partial}, store_mode?: 'auto' | 'preorder' | 'realtime' } */
export async function POST(req: Request) {
  const guard = await requireStaff("settings");
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;

  const parsed = SettingsPostSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path.filter((p) => p !== "settings").join(".");
    return badRequest(`ערך לא תקין${field ? ` בשדה ${field}` : ""}: ${issue?.message ?? ""}`.trim(), parsed.error.flatten());
  }
  const { settings, store_mode } = parsed.data;

  try {
    const admin = createAdminClient();
    const now = new Date().toISOString();

    if (settings && Object.keys(settings).length > 0) {
      const current = await getServerSettings();
      const merged = { ...current, ...settings };
      if (!weekTimesValid(merged)) {
        return badRequest("סגירת השבוע חייבת להיות אחרי ההזמנה מהספק.");
      }
      const rows = Object.entries(settings).map(([key, value]) => ({ key, value, updated_at: now }));
      const { error } = await admin.from("system_settings").upsert(rows, { onConflict: "key" });
      if (error) throw new Error(`system_settings: ${error.message}`);
    }

    if (store_mode) {
      const { error } = await admin
        .from("store_settings")
        .upsert({ key: "mode", value: store_mode, updated_at: now }, { onConflict: "key" });
      if (error) throw new Error(`store_settings: ${error.message}`);
    }

    return NextResponse.json(await snapshot());
  } catch (e) {
    return serverError("settings", e);
  }
}
