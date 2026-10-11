import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const ADMIN_AUTH_COOKIE = "flowers_admin_auth";
export const STALL_AUTH_COOKIE = "flowers_stall_auth";
export const COURIER_AUTH_COOKIE = "flowers_courier_auth";

function readCookie(name: string): string | undefined {
  try {
    const store = cookies();
    return store.get(name)?.value;
  } catch {
    // cookies() may be unavailable in some edge runtimes.
    return undefined;
  }
}

export function requireAdmin(): NextResponse | null {
  if (readCookie(ADMIN_AUTH_COOKIE) === "1") return null;
  return NextResponse.json({ error: "נדרשת הזדהות מנהל" }, { status: 401 });
}

export function requireStall(): NextResponse | null {
  if (readCookie(STALL_AUTH_COOKIE) === "1") return null;
  return NextResponse.json({ error: "נדרשת הזדהות דוכן" }, { status: 401 });
}

export function requireCourier(): NextResponse | null {
  if (readCookie(COURIER_AUTH_COOKIE) === "1") return null;
  return NextResponse.json({ error: "נדרשת הזדהות שליח" }, { status: 401 });
}

export function requireAdminOrStall(): NextResponse | null {
  if (readCookie(ADMIN_AUTH_COOKIE) === "1" || readCookie(STALL_AUTH_COOKIE) === "1") return null;
  return NextResponse.json(
    { error: "נדרשת הזדהות מנהל או דוכן" },
    { status: 401 },
  );
}

export function requireAdminOrCourier(): NextResponse | null {
  if (readCookie(ADMIN_AUTH_COOKIE) === "1" || readCookie(COURIER_AUTH_COOKIE) === "1") return null;
  return NextResponse.json(
    { error: "נדרשת הזדהות מנהל או שליח" },
    { status: 401 },
  );
}