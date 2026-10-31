import { NextResponse } from "next/server";
import { getStaffSession } from "@/lib/staff/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const session = await getStaffSession();
  if (!session) {
    return NextResponse.json({ error: "נדרשת התחברות עובד" }, { status: 401 });
  }
  return NextResponse.json({ employee: session.employee });
}
