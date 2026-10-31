// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetTestCookies, setTestCookies } from "@/test/cookie-mock";
import {
  requireAdmin,
  requireAdminOrStall,
  requireCourier,
  requireCourierOrPasscode,
  requireStall,
} from "@/lib/admin-auth";
import { signToken } from "@/lib/signed-token";

describe("admin-auth helpers", () => {
  beforeEach(() => {
    vi.stubEnv("STAFF_SESSION_SECRET", "s".repeat(48));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    resetTestCookies();
  });

  it("requireAdmin rejects the forgeable legacy value '1'", () => {
    setTestCookies({ flowers_admin_auth: "1" });
    expect(requireAdmin()?.status).toBe(401);
  });

  it("requireStall rejects the default '1' stall cookie", () => {
    resetTestCookies();
    expect(requireStall()?.status).toBe(401);
  });

  it("requireAdmin accepts a signed admin token", () => {
    setTestCookies({ flowers_admin_auth: signToken({ k: "admin" }, 60) });
    expect(requireAdmin()).toBeNull();
  });

  it("does not accept a token of another kind in the admin cookie", () => {
    setTestCookies({ flowers_admin_auth: signToken({ k: "stall" }, 60) });
    expect(requireAdmin()?.status).toBe(401);
    expect(requireAdminOrStall()?.status).toBe(401);
  });

  it("requireAdmin accepts an owner staff session", () => {
    setTestCookies({
      flowers_staff_session: signToken({ k: "staff", eid: "e1", role: "owner", wt: [] }, 60),
    });
    expect(requireAdmin()).toBeNull();
    expect(requireStall()).toBeNull();
    expect(requireCourier()).toBeNull();
  });

  it("ops_manager staff session passes stall/courier but not admin", () => {
    setTestCookies({
      flowers_staff_session: signToken({ k: "staff", eid: "e1", role: "ops_manager", wt: [] }, 60),
    });
    expect(requireAdmin()?.status).toBe(401);
    expect(requireStall()).toBeNull();
    expect(requireCourier()).toBeNull();
  });

  it("worker staff session follows work types", () => {
    setTestCookies({
      flowers_staff_session: signToken(
        { k: "staff", eid: "e1", role: "worker", wt: ["stall_seller"] },
        60,
      ),
    });
    expect(requireStall()).toBeNull();
    expect(requireCourier()?.status).toBe(401);
    expect(requireAdmin()?.status).toBe(401);
  });

  it("rejects everything when the secret is missing", () => {
    const token = signToken({ k: "admin" }, 60);
    vi.stubEnv("STAFF_SESSION_SECRET", "");
    setTestCookies({ flowers_admin_auth: token });
    expect(requireAdmin()?.status).toBe(401);
  });

  it("courier passcode header works only with a matching configured PIN", () => {
    setTestCookies({});
    const req = (h?: string) =>
      new Request("http://x/api/courier/orders", {
        headers: h === undefined ? {} : { "x-courier-passcode": h },
      });
    // COURIER_PIN is mocked to "9012" in src/test/setup.ts
    expect(requireCourierOrPasscode(req("9012"))).toBeNull();
    expect(requireCourierOrPasscode(req("0000"))?.status).toBe(401);
    expect(requireCourierOrPasscode(req(""))?.status).toBe(401);
    expect(requireCourierOrPasscode(req())?.status).toBe(401);
  });
});
