import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const ADMIN_AUTH_COOKIE = "flowers_admin_auth";

export function requireAdmin(): NextResponse | null {
  try {
    const store = cookies();
    if (store.get(ADMIN_AUTH_COOKIE)?.value === "1") return null;
  } catch {
    // cookies() may be unavailable in some edge runtimes; fall through to deny.
  }
  return NextResponse.json({ error: "נדרשת הזדהות מנהל" }, { status: 401 });
}