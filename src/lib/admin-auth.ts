import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { timingSafeEqual, createHash } from "node:crypto";
import { COURIER_PIN } from "@/lib/constants";
import {
  ADMIN_AUTH_COOKIE,
  COURIER_AUTH_COOKIE,
  MISSING_SECRET_MESSAGE,
  STAFF_SESSION_COOKIE,
  STAFF_TOKEN_TTL_SECONDS,
  STALL_AUTH_COOKIE,
  grantsAdmin,
  grantsCourier,
  grantsStall,
  verifyToken,
  type TokenPayload,
} from "@/lib/signed-token";

export {
  ADMIN_AUTH_COOKIE,
  STALL_AUTH_COOKIE,
  COURIER_AUTH_COOKIE,
  STAFF_SESSION_COOKIE,
};

function readCookie(name: string): string | undefined {
  try {
    const store = cookies();
    return store.get(name)?.value;
  } catch {
    // cookies() may be unavailable in some edge runtimes.
    return undefined;
  }
}

/** Verified token from a cookie, or null. Legacy cookies must carry the matching kind. */
function readToken(name: string, expectedKind: TokenPayload["k"]): TokenPayload | null {
  const p = verifyToken(readCookie(name));
  return p && p.k === expectedKind ? p : null;
}

function staffToken(): TokenPayload | null {
  return readToken(STAFF_SESSION_COOKIE, "staff");
}

export function hasAdminAccess(): boolean {
  return grantsAdmin(readToken(ADMIN_AUTH_COOKIE, "admin")) || grantsAdmin(staffToken());
}

export function hasStallAccess(): boolean {
  return grantsStall(readToken(STALL_AUTH_COOKIE, "stall")) || grantsStall(staffToken());
}

export function hasCourierAccess(): boolean {
  return grantsCourier(readToken(COURIER_AUTH_COOKIE, "courier")) || grantsCourier(staffToken());
}

export function requireAdmin(): NextResponse | null {
  if (hasAdminAccess()) return null;
  return NextResponse.json({ error: "נדרשת הזדהות מנהל" }, { status: 401 });
}

export function requireStall(): NextResponse | null {
  if (hasStallAccess()) return null;
  return NextResponse.json({ error: "נדרשת הזדהות דוכן" }, { status: 401 });
}

export function requireCourier(): NextResponse | null {
  if (hasCourierAccess()) return null;
  return NextResponse.json({ error: "נדרשת הזדהות שליח" }, { status: 401 });
}

export function requireAdminOrStall(): NextResponse | null {
  if (hasAdminAccess() || hasStallAccess()) return null;
  return NextResponse.json(
    { error: "נדרשת הזדהות מנהל או דוכן" },
    { status: 401 },
  );
}

export function requireAdminOrCourier(): NextResponse | null {
  if (hasAdminAccess() || hasCourierAccess()) return null;
  return NextResponse.json(
    { error: "נדרשת הזדהות מנהל או שליח" },
    { status: 401 },
  );
}

/** Constant-time string comparison (hashing first so lengths always match). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Courier access via cookie, or via the `x-courier-passcode` header — the header
 * is only honoured when COURIER_PIN is configured (non-empty).
 */
export function requireCourierOrPasscode(req: Request): NextResponse | null {
  if (hasCourierAccess()) return null;
  const pin = (COURIER_PIN ?? "").trim();
  const header = req.headers.get("x-courier-passcode") ?? "";
  if (pin.length > 0 && header.length > 0 && safeEqual(header, pin)) return null;
  return NextResponse.json({ error: "נדרש זיהוי שליח" }, { status: 401 });
}

export function staffSecretMissingResponse(): NextResponse {
  return NextResponse.json({ error: MISSING_SECRET_MESSAGE }, { status: 503 });
}

export const STAFF_COOKIE_OPTIONS = {
  path: "/",
  maxAge: STAFF_TOKEN_TTL_SECONDS,
  sameSite: "lax" as const,
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
};
