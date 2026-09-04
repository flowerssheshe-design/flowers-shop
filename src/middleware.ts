import { NextRequest, NextResponse } from "next/server";

export const ADMIN_AUTH_COOKIE = "flowers_admin_auth";

export function isAdminRequest(req: NextRequest): boolean {
  return req.cookies.get(ADMIN_AUTH_COOKIE)?.value === "1";
}

export function adminUnauthorized() {
  return NextResponse.json({ error: "נדרשת הזדהות מנהל" }, { status: 401 });
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Gate /admin/* pages (excluding the login gate itself and the public verify-pin API)
  const isAdminPage =
    pathname === "/admin" ||
    (pathname.startsWith("/admin/") && !pathname.startsWith("/api/"));

  if (!isAdminPage) return NextResponse.next();

  const authed = isAdminRequest(req);
  if (authed) return NextResponse.next();

  // Allow the gate page itself
  if (pathname === "/admin") return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/admin";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/admin/:path*"],
};