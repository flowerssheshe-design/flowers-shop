// Shared by the browser (VisitTracker) and the server (track-visit, /go).
// Keep it free of server-only imports.

/** Cookie set by /go/[slug]; holds the tracking_links.id. */
export const REF_COOKIE = "flowers_ref";
export const REF_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

/** Back-office areas: staff visits there must not count as site visits. */
export const NOT_TRACKED_PREFIXES = ["/staff", "/admin", "/stall", "/courier", "/go", "/api"];

export function isTrackedPath(pathname: string | null | undefined): boolean {
  if (typeof pathname !== "string" || !pathname.startsWith("/")) return false;
  const path = pathname.split(/[?#]/)[0].toLowerCase();
  return !NOT_TRACKED_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));
}

/**
 * Only same-site paths may follow /go/[slug]?to=… (no open redirect).
 * Returns the cleaned path, or null when it is not safe.
 */
export function safeRedirectPath(to: string | null | undefined): string | null {
  if (typeof to !== "string") return null;
  const value = to.trim();
  if (!value || value.length > 500) return null;
  if (!value.startsWith("/")) return null;
  // "//evil.com" and "/\evil.com" are protocol-relative in browsers.
  if (value.startsWith("//") || value.startsWith("/\\")) return null;
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return null;
  // Encoded tricks: "/%2F%2Fevil.com", "/%5Cevil.com".
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  if (decoded.startsWith("//") || decoded.startsWith("/\\") || /[\\\u0000-\u001f\u007f]/.test(decoded)) {
    return null;
  }
  // Don't bounce marketing visitors into the back office or into a /go loop.
  if (!isTrackedPath(value)) return null;
  return value;
}

/** Keeps only the origin of an external referrer ("" for own site / invalid). */
export function cleanReferrer(referrer: string | null | undefined, ownHost?: string | null): string | null {
  if (!referrer) return null;
  try {
    const url = new URL(referrer);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (ownHost && url.host === ownHost) return null;
    return url.origin.slice(0, 200);
  } catch {
    return null;
  }
}
