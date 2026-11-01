import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/staff/guard";
import { getStoreModeInfo } from "@/lib/storeMode";
import { runWeekClose } from "@/lib/staff/owner/week-close-store";
import { notConfigured, serverError } from "@/lib/staff/owner/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Current business week, its phase and the store mode. */
export async function GET() {
  const guard = await requireStaff("dashboard");
  if (!guard.ok) return guard.response;
  try {
    const info = await getStoreModeInfo();
    return NextResponse.json({
      week: {
        weekStart: info.week.weekStart,
        weekEnd: info.week.weekEnd,
        phase: info.week.phase,
        supplierOrderAt: info.week.supplierOrderAt.toISOString(),
        closesAt: info.week.closesAt.toISOString(),
      },
      storeMode: { mode: info.mode, setting: info.setting },
    });
  } catch (e) {
    return serverError("week", e);
  }
}

/** Closes past weeks now (same as the automatic close). Safe to repeat. */
export async function POST() {
  const guard = await requireStaff("dashboard");
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;
  try {
    const result = await runWeekClose();
    if (result.errors.length) {
      console.error("[staff/week] close errors:", result.errors);
      return NextResponse.json({ ...result, error: "סגירת השבוע נכשלה. נסו שוב בעוד כמה דקות." }, { status: 500 });
    }
    return NextResponse.json(result);
  } catch (e) {
    return serverError("week", e);
  }
}
