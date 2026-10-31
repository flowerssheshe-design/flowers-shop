import { NextResponse } from "next/server";
import { z } from "zod";
import { STALL_PIN } from "@/lib/constants";
import {
  STALL_AUTH_COOKIE,
  STAFF_COOKIE_OPTIONS,
  safeEqual,
  staffSecretMissingResponse,
} from "@/lib/admin-auth";
import {
  STAFF_TOKEN_TTL_SECONDS,
  isStaffSecretMissingError,
  signToken,
} from "@/lib/signed-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const Body = z.object({ pin: z.string().min(1).max(50) });

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "בקשה לא תקינה" },
      { status: 400 },
    );
  }

  const configured = (STALL_PIN ?? "").trim();
  if (!configured || !safeEqual(parsed.data.pin.trim(), configured)) {
    return NextResponse.json(
      { success: false, error: "PIN שגוי" },
      { status: 401 }
    );
  }

  let token: string;
  try {
    token = signToken({ k: "stall" }, STAFF_TOKEN_TTL_SECONDS);
  } catch (e) {
    if (isStaffSecretMissingError(e)) return staffSecretMissingResponse();
    throw e;
  }

  const res = NextResponse.json({ success: true });
  res.cookies.set(STALL_AUTH_COOKIE, token, STAFF_COOKIE_OPTIONS);
  return res;
}
