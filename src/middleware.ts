import { NextRequest, NextResponse } from "next/server";
import { STAFF_SESSION_COOKIE, verifyTokenEdge } from "@/lib/signed-token-edge";

/** Old addresses of the PIN-based management screens → the staff area. */
const OLD_SCREENS: Record<string, string> = {
  "/admin": "/staff",
  "/stall": "/staff/stall",
  "/courier": "/staff/deliveries",
};

function redirectTo(req: NextRequest, pathname: string) {
  const url = req.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  return NextResponse.redirect(url);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  for (const [old, target] of Object.entries(OLD_SCREENS)) {
    if (pathname === old || pathname.startsWith(old + "/")) return redirectTo(req, target);
  }

  if (pathname === "/staff" || pathname.startsWith("/staff/")) {
    // Section permissions are checked again (against the DB) by each page.
    if (pathname === "/staff/login") return NextResponse.next();
    const token = await verifyTokenEdge(req.cookies.get(STAFF_SESSION_COOKIE)?.value);
    if (token && token.k === "staff") return NextResponse.next();
    return redirectTo(req, "/staff/login");
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/stall", "/stall/:path*", "/courier", "/courier/:path*", "/staff/:path*", "/staff"],
};
