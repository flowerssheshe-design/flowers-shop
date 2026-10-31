import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED } from "@/lib/constants";
import {
  STAFF_COOKIE_OPTIONS,
  STAFF_SESSION_COOKIE,
  staffSecretMissingResponse,
} from "@/lib/admin-auth";
import {
  STAFF_ROLES,
  STAFF_TOKEN_TTL_SECONDS,
  getSessionSecret,
  signToken,
  type StaffRole,
} from "@/lib/signed-token";
import { verifyPin, verifyPinDummy } from "@/lib/staff/pin";
import { normalizePhone } from "@/lib/staff/phone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

const Body = z.object({
  phone: z.string().min(1).max(30),
  pin: z.string().min(1).max(20),
});

function invalidCredentials() {
  return NextResponse.json({ error: "טלפון או קוד שגויים" }, { status: 401 });
}

function lockedResponse() {
  return NextResponse.json(
    { error: "יותר מדי ניסיונות. נסו שוב בעוד כמה דקות" },
    { status: 429 },
  );
}

type EmployeeRow = {
  id: string;
  full_name: string | null;
  phone: string;
  pin_hash: string | null;
  role: string;
  work_types: string[] | null;
  is_active: boolean;
  failed_pin_attempts: number | null;
  locked_until: string | null;
  last_login_at: string | null;
};

export async function POST(req: Request) {
  // Fail closed before touching the DB if we cannot issue a session.
  if (!getSessionSecret()) return staffSecretMissingResponse();
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json({ error: "המערכת אינה מוגדרת" }, { status: 503 });
  }

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }
  const pin = parsed.data.pin.trim();
  const phone = normalizePhone(parsed.data.phone);
  if (!phone) {
    await verifyPinDummy(pin);
    return invalidCredentials();
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("employees")
      .select(
        "id, full_name, phone, pin_hash, role, work_types, is_active, failed_pin_attempts, locked_until, last_login_at",
      )
      .eq("phone", phone)
      .maybeSingle();

    if (error) {
      console.error("staff login lookup failed:", error);
      return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
    }

    const emp = data as EmployeeRow | null;
    if (!emp || emp.is_active !== true) {
      await verifyPinDummy(pin);
      return invalidCredentials();
    }

    const now = Date.now();
    if (emp.locked_until && new Date(emp.locked_until).getTime() > now) {
      return lockedResponse();
    }

    const ok = await verifyPin(pin, emp.pin_hash);
    if (!ok) {
      const attempts = (emp.failed_pin_attempts ?? 0) + 1;
      const lock = attempts >= MAX_FAILED_ATTEMPTS;
      const { error: updErr } = await admin
        .from("employees")
        .update(
          lock
            ? {
                failed_pin_attempts: 0,
                locked_until: new Date(now + LOCK_MINUTES * 60_000).toISOString(),
              }
            : { failed_pin_attempts: attempts },
        )
        .eq("id", emp.id);
      if (updErr) console.error("staff login attempt update failed:", updErr);
      return lock ? lockedResponse() : invalidCredentials();
    }

    if (!STAFF_ROLES.includes(emp.role as StaffRole)) {
      console.error("staff login: unknown role on employee", emp.id);
      return invalidCredentials();
    }
    const role = emp.role as StaffRole;
    const workTypes = Array.isArray(emp.work_types) ? emp.work_types.map(String) : [];

    const { error: updErr } = await admin
      .from("employees")
      .update({
        failed_pin_attempts: 0,
        locked_until: null,
        last_login_at: new Date(now).toISOString(),
      })
      .eq("id", emp.id);
    if (updErr) console.error("staff login success update failed:", updErr);

    const token = signToken(
      { k: "staff", eid: emp.id, role, wt: workTypes },
      STAFF_TOKEN_TTL_SECONDS,
    );
    const res = NextResponse.json({
      employee: {
        id: emp.id,
        full_name: emp.full_name ?? "",
        role,
        work_types: workTypes,
      },
    });
    res.cookies.set(STAFF_SESSION_COOKIE, token, STAFF_COOKIE_OPTIONS);
    return res;
  } catch (e) {
    console.error("staff login exception:", e);
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}
