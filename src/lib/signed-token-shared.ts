// Shared, runtime-agnostic pieces of the signed staff token.
// MUST NOT import node:* modules: this file is bundled into the edge middleware.

export const ADMIN_AUTH_COOKIE = "flowers_admin_auth";
export const STALL_AUTH_COOKIE = "flowers_stall_auth";
export const COURIER_AUTH_COOKIE = "flowers_courier_auth";
export const STAFF_SESSION_COOKIE = "flowers_staff_session";

export const STAFF_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
export const MIN_SECRET_LENGTH = 32;
export const MISSING_SECRET_MESSAGE = "המערכת לא מוגדרת: חסר STAFF_SESSION_SECRET";

export type TokenKind = "admin" | "stall" | "courier" | "staff";
export type StaffRole = "owner" | "ops_manager" | "marketing" | "worker";

export const STAFF_ROLES: readonly StaffRole[] = [
  "owner",
  "ops_manager",
  "marketing",
  "worker",
];

export type TokenPayload = {
  k: TokenKind;
  eid?: string;
  role?: StaffRole;
  wt?: string[];
  exp: number; // unix seconds
};

export function getSessionSecret(): string | null {
  const s = process.env.STAFF_SESSION_SECRET;
  if (!s || s.length < MIN_SECRET_LENGTH) return null;
  return s;
}

const KINDS: readonly TokenKind[] = ["admin", "stall", "courier", "staff"];

/** Validates the decoded payload shape and expiry. Returns null when invalid. */
export function validatePayload(raw: unknown, nowSeconds = Math.floor(Date.now() / 1000)): TokenPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.k !== "string" || !KINDS.includes(p.k as TokenKind)) return null;
  if (typeof p.exp !== "number" || !Number.isFinite(p.exp)) return null;
  if (p.exp <= nowSeconds) return null;
  if (p.eid !== undefined && typeof p.eid !== "string") return null;
  if (p.role !== undefined && !STAFF_ROLES.includes(p.role as StaffRole)) return null;
  if (p.wt !== undefined && (!Array.isArray(p.wt) || !p.wt.every((w) => typeof w === "string"))) {
    return null;
  }
  if (p.k === "staff" && (!p.eid || !p.role)) return null;
  return {
    k: p.k as TokenKind,
    exp: p.exp,
    ...(p.eid !== undefined ? { eid: p.eid as string } : {}),
    ...(p.role !== undefined ? { role: p.role as StaffRole } : {}),
    ...(p.wt !== undefined ? { wt: p.wt as string[] } : {}),
  };
}

// ---- Access rules (shared by admin-auth.ts and middleware.ts) ----

function staffWorkTypes(p: TokenPayload): string[] {
  return Array.isArray(p.wt) ? p.wt : [];
}

/** Admin area: legacy admin token, or staff owner. */
export function grantsAdmin(p: TokenPayload | null): boolean {
  if (!p) return false;
  if (p.k === "admin") return true;
  return p.k === "staff" && p.role === "owner";
}

/** Stall area: legacy stall token, or staff owner / ops_manager / worker with stall_seller. */
export function grantsStall(p: TokenPayload | null): boolean {
  if (!p) return false;
  if (p.k === "stall") return true;
  if (p.k !== "staff") return false;
  if (p.role === "owner" || p.role === "ops_manager") return true;
  return p.role === "worker" && staffWorkTypes(p).includes("stall_seller");
}

/** Courier area: legacy courier token, or staff owner / ops_manager / worker with courier. */
export function grantsCourier(p: TokenPayload | null): boolean {
  if (!p) return false;
  if (p.k === "courier") return true;
  if (p.k !== "staff") return false;
  if (p.role === "owner" || p.role === "ops_manager") return true;
  return p.role === "worker" && staffWorkTypes(p).includes("courier");
}
