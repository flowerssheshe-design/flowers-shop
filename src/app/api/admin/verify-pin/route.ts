import { NextResponse } from "next/server";
import { z } from "zod";
import { SUPABASE_CONFIGURED } from "@/lib/constants";
import {
  ADMIN_AUTH_COOKIE,
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

function okWithCookie() {
  let token: string;
  try {
    token = signToken({ k: "admin" }, STAFF_TOKEN_TTL_SECONDS);
  } catch (e) {
    if (isStaffSecretMissingError(e)) return staffSecretMissingResponse();
    throw e;
  }
  const res = NextResponse.json({ success: true });
  res.cookies.set(ADMIN_AUTH_COOKIE, token, STAFF_COOKIE_OPTIONS);
  return res;
}

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  const submitted = parsed.data.pin.trim();
  const envPin = process.env.ADMIN_PIN?.trim();

  if (envPin && envPin.length > 0) {
    if (safeEqual(submitted, envPin)) return okWithCookie();
  }

  if (SUPABASE_CONFIGURED) {
    try {
      // Service-role client: site_config is no longer publicly readable.
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("site_config")
        .select("value")
        .eq("key", "admin_pin")
        .maybeSingle();

      const dbPin = typeof data?.value === "string" ? data.value.trim() : "";
      if (error || !dbPin) {
        if (!envPin) {
          return NextResponse.json(
            { error: "לא הוגדר קוד מנהל" },
            { status: 401 },
          );
        }
      } else if (safeEqual(submitted, dbPin)) {
        return okWithCookie();
      }
    } catch (e) {
      console.error(e);
    }
  }

  return NextResponse.json({ error: "קוד שגוי" }, { status: 401 });
}
