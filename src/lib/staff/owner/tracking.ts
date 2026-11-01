// Validates the marketing referral cookie (flowers_ref, set by /go/[slug])
// before an order stores it. Only an existing, active tracking link counts.

export const TRACKING_COOKIE = "flowers_ref";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

type TrackingLinkQuery = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, value: string) => {
        maybeSingle: () => PromiseLike<{
          data: { id?: unknown; is_active?: unknown } | null;
          error: unknown;
        }>;
      };
    };
  };
};

/**
 * Returns the tracking link id when `raw` is a uuid of an active row in
 * tracking_links, otherwise null. Never throws.
 */
export async function resolveTrackingLinkId(
  admin: unknown,
  raw: string | null | undefined,
): Promise<string | null> {
  if (!isUuid(raw)) return null;
  const id = raw.trim().toLowerCase();
  try {
    const { data, error } = await (admin as TrackingLinkQuery)
      .from("tracking_links")
      .select("id, is_active")
      .eq("id", id)
      .maybeSingle();
    if (error || !data || data.is_active !== true) return null;
    return String(data.id);
  } catch {
    return null;
  }
}
