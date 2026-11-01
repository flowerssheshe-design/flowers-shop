import { describe, expect, it } from "vitest";
import { cleanReferrer, isTrackedPath, safeRedirectPath } from "./tracking";

describe("safeRedirectPath (?to= on /go links)", () => {
  it.each(["/", "/catalog", "/profile?x=1", "/#flowers", "/catalog/roses"])("allows %s", (p) => {
    expect(safeRedirectPath(p)).toBe(p);
  });
  it.each([
    null,
    undefined,
    "",
    "https://evil.com",
    "http://evil.com/",
    "//evil.com",
    "/\\evil.com",
    "\\\\evil.com",
    "javascript:alert(1)",
    "catalog",
    "/%2F%2Fevil.com",
    "/%5Cevil.com",
    "/foo\nbar",
    "/%0d%0aSet-Cookie:x",
    "/staff",
    "/admin/orders",
    "/go/other",
    "/api/orders",
    "/" + "a".repeat(600),
  ])("blocks %j", (p) => {
    expect(safeRedirectPath(p as string)).toBeNull();
  });
  it("blocks malformed encoding", () => {
    expect(safeRedirectPath("/%E0%A4%A")).toBeNull();
  });
});

describe("isTrackedPath", () => {
  it.each(["/", "/catalog", "/profile", "/login", "/staffing", "/goods", "/administrator-tips"])("tracks %s", (p) => {
    expect(isTrackedPath(p)).toBe(true);
  });
  it.each([
    "/staff",
    "/staff/",
    "/staff/marketing",
    "/admin",
    "/admin/messages",
    "/stall",
    "/stall/x",
    "/courier",
    "/courier/today",
    "/go",
    "/go/flyer",
    "/STAFF/login",
    "/api/track-visit",
    "/staff?x=1",
    "",
    "relative",
    null,
    undefined,
  ])("does not track %j", (p) => {
    expect(isTrackedPath(p as string)).toBe(false);
  });
});

describe("cleanReferrer", () => {
  it("keeps only the origin of external referrers", () => {
    expect(cleanReferrer("https://l.instagram.com/?u=abc&e=123", "flowers.co.il")).toBe("https://l.instagram.com");
  });
  it("drops own-site and invalid referrers", () => {
    expect(cleanReferrer("https://flowers.co.il/catalog", "flowers.co.il")).toBeNull();
    expect(cleanReferrer("not a url")).toBeNull();
    expect(cleanReferrer("android-app://com.whatsapp")).toBeNull();
    expect(cleanReferrer("")).toBeNull();
  });
});
