// Tracking-link slugs: what comes after /go/. Must match the DB check in
// migration 031: ^[a-z0-9][a-z0-9-]{1,48}$ (2–49 chars, lowercase latin,
// digits and dashes, not starting with a dash).

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,48}$/;
export const SLUG_MAX = 49;

export function isValidSlug(value: unknown): value is string {
  return typeof value === "string" && SLUG_RE.test(value) && !value.endsWith("-") && !value.includes("--");
}

// Rough Hebrew → latin, only to suggest something readable.
const HEBREW: Record<string, string> = {
  א: "a", ב: "b", ג: "g", ד: "d", ה: "h", ו: "v", ז: "z", ח: "ch", ט: "t", י: "y",
  כ: "k", ך: "k", ל: "l", מ: "m", ם: "m", נ: "n", ן: "n", ס: "s", ע: "a", פ: "p",
  ף: "f", צ: "tz", ץ: "tz", ק: "k", ר: "r", ש: "sh", ת: "t",
};

/** Suggests a valid slug from a free-text (Hebrew or English) name. */
export function suggestSlug(name: string): string {
  const latin = Array.from((name ?? "").toLowerCase())
    .map((ch) => HEBREW[ch] ?? ch)
    .join("")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");
  let slug = latin
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-$/, "");
  if (slug.length < 2) slug = slug ? `link-${slug}` : "link";
  return slug;
}

/** Normalizes what the user typed into the slug field (lowercase, spaces → dashes). */
export function normalizeSlugInput(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, SLUG_MAX);
}
