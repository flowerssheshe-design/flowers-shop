import "server-only";
import { NextResponse } from "next/server";
import { SUPABASE_CONFIGURED } from "@/lib/constants";

export function notConfigured(): NextResponse | null {
  if (SUPABASE_CONFIGURED) return null;
  return NextResponse.json({ error: "המערכת עוד לא מחוברת למסד הנתונים." }, { status: 503 });
}

export function serverError(where: string, e: unknown): NextResponse {
  console.error(`[staff/${where}]`, e);
  return NextResponse.json({ error: "משהו השתבש בשרת. נסו לרענן בעוד רגע." }, { status: 500 });
}

export function badRequest(message: string, details?: unknown): NextResponse {
  return NextResponse.json(details ? { error: message, details } : { error: message }, { status: 400 });
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
