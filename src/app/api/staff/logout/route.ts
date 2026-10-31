import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ADMIN_AUTH_COOKIE,
  COURIER_AUTH_COOKIE,
  STAFF_COOKIE_OPTIONS,
  STAFF_SESSION_COOKIE,
  STALL_AUTH_COOKIE,
} from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Optional body `{ scope }`: the auth cookies are httpOnly, so the client can't
// clear them itself. Default clears only the staff session; "admin" / "stall" /
// "courier" also clear that legacy PIN cookie; "all" clears every staff cookie.
const Body = z
  .object({ scope: z.enum(["staff", "admin", "stall", "courier", "all"]).optional() })
  .nullable();

const LEGACY: Record<"admin" | "stall" | "courier", string> = {
  admin: ADMIN_AUTH_COOKIE,
  stall: STALL_AUTH_COOKIE,
  courier: COURIER_AUTH_COOKIE,
};

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  const scope = (parsed.success && parsed.data?.scope) || "staff";

  const names = new Set<string>([STAFF_SESSION_COOKIE]);
  if (scope === "all") Object.values(LEGACY).forEach((n) => names.add(n));
  else if (scope !== "staff") names.add(LEGACY[scope]);

  const res = NextResponse.json({ success: true });
  for (const name of Array.from(names)) {
    res.cookies.set(name, "", { ...STAFF_COOKIE_OPTIONS, maxAge: 0 });
  }
  return res;
}
