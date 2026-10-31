// Node-runtime signed tokens (HMAC-SHA256).
// Format: base64url(JSON payload) + "." + base64url(signature over the first part).
// For the edge middleware use signed-token-edge.ts (no node:crypto there).
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  getSessionSecret,
  validatePayload,
  type TokenPayload,
} from "@/lib/signed-token-shared";

export * from "@/lib/signed-token-shared";

export class StaffSecretMissingError extends Error {
  readonly code = "STAFF_SESSION_SECRET_MISSING";
  constructor() {
    super("STAFF_SESSION_SECRET is missing or shorter than 32 characters");
    this.name = "StaffSecretMissingError";
  }
}

export function isStaffSecretMissingError(e: unknown): e is StaffSecretMissingError {
  return e instanceof StaffSecretMissingError;
}

function hmac(secret: string, data: string): Buffer {
  return createHmac("sha256", secret).update(data).digest();
}

export function signToken(
  payload: Omit<TokenPayload, "exp">,
  ttlSeconds: number,
): string {
  const secret = getSessionSecret();
  if (!secret) throw new StaffSecretMissingError();
  const full: TokenPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + Math.floor(ttlSeconds),
  };
  const body = Buffer.from(JSON.stringify(full), "utf8").toString("base64url");
  const sig = hmac(secret, body).toString("base64url");
  return `${body}.${sig}`;
}

/** Returns the payload when signature and expiry are valid, otherwise null (fails closed). */
export function verifyToken(token: string | undefined | null): TokenPayload | null {
  if (!token || typeof token !== "string" || token.length > 4096) return null;
  const secret = getSessionSecret();
  if (!secret) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [body, sigPart] = parts;
  const expected = hmac(secret, body);
  const given = Buffer.from(sigPart, "base64url");
  if (given.length !== expected.length) return null;
  if (!timingSafeEqual(given, expected)) return null;
  try {
    const json = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return validatePayload(json);
  } catch {
    return null;
  }
}
