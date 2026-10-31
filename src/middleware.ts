import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_AUTH_COOKIE,
  COURIER_AUTH_COOKIE,
  STAFF_SESSION_COOKIE,
  STALL_AUTH_COOKIE,
  grantsAdmin,
  grantsCourier,
  grantsStall,
  verifyTokenEdge,
  type TokenKind,
  type TokenPayload,
} from "@/lib/signed-token-edge";

export { ADMIN_AUTH_COOKIE, STALL_AUTH_COOKIE, COURIER_AUTH_COOKIE };

async function readToken(
  req: NextRequest,
  name: string,
  kind: TokenKind,
): Promise<TokenPayload | null> {
  const p = await verifyTokenEdge(req.cookies.get(name)?.value);
  return p && p.k === kind ? p : null;
}

async function hasAccess(
  req: NextRequest,
  legacyCookie: string,
  legacyKind: TokenKind,
  grants: (p: TokenPayload | null) => boolean,
): Promise<boolean> {
  if (grants(await readToken(req, legacyCookie, legacyKind))) return true;
  return grants(await readToken(req, STAFF_SESSION_COOKIE, "staff"));
}

export function isAdminRequest(req: NextRequest): Promise<boolean> {
  return hasAccess(req, ADMIN_AUTH_COOKIE, "admin", grantsAdmin);
}

export function isStallRequest(req: NextRequest): Promise<boolean> {
  return hasAccess(req, STALL_AUTH_COOKIE, "stall", grantsStall);
}

export function isCourierRequest(req: NextRequest): Promise<boolean> {
  return hasAccess(req, COURIER_AUTH_COOKIE, "courier", grantsCourier);
}

function redirectTo(req: NextRequest, pathname: string) {
  const url = req.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  return NextResponse.redirect(url);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isAdminPage =
    pathname === "/admin" ||
    (pathname.startsWith("/admin/") && !pathname.startsWith("/api/"));

  if (isAdminPage) {
    // The /admin root renders the login gate itself.
    if (pathname === "/admin") return NextResponse.next();
    if (await isAdminRequest(req)) return NextResponse.next();
    return redirectTo(req, "/admin");
  }

  if (pathname === "/stall" || pathname.startsWith("/stall/")) {
    if (pathname === "/stall") return NextResponse.next();
    if (await isStallRequest(req)) return NextResponse.next();
    return redirectTo(req, "/stall");
  }

  if (pathname === "/courier" || pathname.startsWith("/courier/")) {
    if (pathname === "/courier") return NextResponse.next();
    if (await isCourierRequest(req)) return NextResponse.next();
    return redirectTo(req, "/courier");
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/stall/:path*", "/courier/:path*"],
};
