import { NextRequest, NextResponse } from "next/server";

export const ADMIN_AUTH_COOKIE = "flowers_admin_auth";
export const STALL_AUTH_COOKIE = "flowers_stall_auth";
export const COURIER_AUTH_COOKIE = "flowers_courier_auth";

export function isAdminRequest(req: NextRequest): boolean {
  return req.cookies.get(ADMIN_AUTH_COOKIE)?.value === "1";
}

export function isStallRequest(req: NextRequest): boolean {
  return req.cookies.get(STALL_AUTH_COOKIE)?.value === "1";
}

export function isCourierRequest(req: NextRequest): boolean {
  return req.cookies.get(COURIER_AUTH_COOKIE)?.value === "1";
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isAdminPage =
    pathname === "/admin" ||
    (pathname.startsWith("/admin/") && !pathname.startsWith("/api/"));

  if (isAdminPage) {
    const authed = isAdminRequest(req);
    if (authed) return NextResponse.next();
    if (pathname === "/admin") return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = "/admin";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (pathname === "/stall" || pathname.startsWith("/stall/")) {
    const authed = isStallRequest(req);
    if (authed) return NextResponse.next();
    if (pathname === "/stall") return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = "/stall";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (pathname === "/courier" || pathname.startsWith("/courier/")) {
    const authed = isCourierRequest(req);
    if (authed) return NextResponse.next();
    if (pathname === "/courier") return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = "/courier";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/stall/:path*", "/courier/:path*"],
};
