// WhatsApp template bodies use {name}-style placeholders. For templates that
// were approved in Meta, the same placeholders become the positional body
// parameters {{1}}, {{2}}… in the order they first appear.

export const PLACEHOLDERS = {
  name: "שם הלקוח",
  deadline: "מועד סגירת ההזמנות",
  site: "כתובת האתר",
} as const;

export type PlaceholderKey = keyof typeof PLACEHOLDERS;
export type TemplateVars = Partial<Record<PlaceholderKey, string>>;

const RE = /\{(\w+)\}/g;

/** Placeholder names in order of first appearance. */
export function extractPlaceholders(body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(RE)) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

export function unknownPlaceholders(body: string): string[] {
  return extractPlaceholders(body).filter((k) => !(k in PLACEHOLDERS));
}

export function renderTemplate(body: string, vars: TemplateVars): string {
  return body.replace(RE, (whole, key: string) => {
    if (!(key in PLACEHOLDERS)) return whole;
    const v = vars[key as PlaceholderKey];
    return v && v.trim() ? v.trim() : key === "name" ? "לקוח/ה יקר/ה" : "";
  });
}

/** Positional parameters for a Meta-approved template. */
export function templateParameters(body: string, vars: TemplateVars): string[] {
  return extractPlaceholders(body).map((k) => renderTemplate(`{${k}}`, vars) || "-");
}

/** First name only — friendlier in a message. */
export function firstName(full: string | null | undefined): string {
  return (full ?? "").trim().split(/\s+/)[0] ?? "";
}
