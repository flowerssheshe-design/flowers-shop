import { z } from "zod";
import { unknownPlaceholders } from "./templates";

export const TemplateBody = z
  .object({
    name: z.string().trim().min(2, "שם התבנית קצר מדי").max(80, "שם התבנית ארוך מדי"),
    body: z.string().trim().min(2, "נוסח ההודעה ריק").max(1024, "נוסח ההודעה ארוך מדי (עד 1024 תווים)"),
    meta_template_name: z
      .string()
      .trim()
      .max(512)
      .regex(/^[a-z0-9_]*$/, "שם התבנית ב-Meta יכול להכיל רק אותיות באנגלית קטנות, ספרות וקו תחתון")
      .optional()
      .nullable(),
    language: z.string().trim().min(2).max(10).default("he"),
  })
  .superRefine((b, ctx) => {
    const bad = unknownPlaceholders(b.body);
    if (bad.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["body"],
        message: `שדה לא מוכר בהודעה: {${bad[0]}}. אפשר להשתמש ב-{name}, {deadline}, {site}.`,
      });
    }
  });

export function templateError(e: z.ZodError): string {
  return e.issues[0]?.message ?? "נתונים לא תקינים";
}
