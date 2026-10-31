// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  StaffSecretMissingError,
  grantsAdmin,
  grantsCourier,
  grantsStall,
  signToken,
  verifyToken,
  type TokenPayload,
} from "@/lib/signed-token";
import { verifyTokenEdge } from "@/lib/signed-token-edge";

const SECRET = "a".repeat(48);

function tamperSignature(token: string): string {
  const [body, sig] = token.split(".");
  const last = sig.at(-1) === "A" ? "B" : "A";
  return `${body}.${sig.slice(0, -1)}${last}`;
}

describe("signed-token", () => {
  beforeEach(() => {
    vi.stubEnv("STAFF_SESSION_SECRET", SECRET);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("round-trips a payload (node + edge)", async () => {
    const token = signToken({ k: "staff", eid: "e1", role: "worker", wt: ["courier"] }, 60);
    expect(token.split(".")).toHaveLength(2);
    const p = verifyToken(token);
    expect(p).toMatchObject({ k: "staff", eid: "e1", role: "worker", wt: ["courier"] });
    expect(p!.exp).toBeGreaterThan(Date.now() / 1000);
    expect(await verifyTokenEdge(token)).toEqual(p);
  });

  it("rejects a tampered signature", async () => {
    const token = tamperSignature(signToken({ k: "admin" }, 60));
    expect(verifyToken(token)).toBeNull();
    expect(await verifyTokenEdge(token)).toBeNull();
  });

  it("rejects a tampered payload", async () => {
    const token = signToken({ k: "stall" }, 60);
    const [, sig] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ k: "admin", exp: Math.floor(Date.now() / 1000) + 60 }),
    ).toString("base64url");
    expect(verifyToken(`${forged}.${sig}`)).toBeNull();
    expect(await verifyTokenEdge(`${forged}.${sig}`)).toBeNull();
  });

  it("rejects garbage and the legacy '1' value", async () => {
    for (const t of ["1", "", "a.b.c", "abc", undefined, null]) {
      expect(verifyToken(t)).toBeNull();
      expect(await verifyTokenEdge(t)).toBeNull();
    }
  });

  it("rejects an expired token", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const token = signToken({ k: "courier" }, 60);
    expect(verifyToken(token)).not.toBeNull();
    vi.setSystemTime(new Date("2026-01-01T00:01:01Z"));
    expect(verifyToken(token)).toBeNull();
    expect(await verifyTokenEdge(token)).toBeNull();
  });

  it("rejects a token signed with another secret", () => {
    const token = signToken({ k: "admin" }, 60);
    vi.stubEnv("STAFF_SESSION_SECRET", "b".repeat(48));
    expect(verifyToken(token)).toBeNull();
  });

  it("fails closed when the secret is missing or too short", async () => {
    const token = signToken({ k: "admin" }, 60);
    for (const secret of ["", "short-secret"]) {
      vi.stubEnv("STAFF_SESSION_SECRET", secret);
      expect(verifyToken(token)).toBeNull();
      expect(await verifyTokenEdge(token)).toBeNull();
      expect(() => signToken({ k: "admin" }, 60)).toThrow(StaffSecretMissingError);
    }
  });
});

describe("role grants", () => {
  const exp = 9_999_999_999;
  const staff = (role: TokenPayload["role"], wt: string[] = []): TokenPayload => ({
    k: "staff",
    eid: "e",
    role,
    wt,
    exp,
  });

  it("owner passes everything", () => {
    const p = staff("owner");
    expect([grantsAdmin(p), grantsStall(p), grantsCourier(p)]).toEqual([true, true, true]);
  });
  it("ops_manager passes stall and courier but not admin", () => {
    const p = staff("ops_manager");
    expect([grantsAdmin(p), grantsStall(p), grantsCourier(p)]).toEqual([false, true, true]);
  });
  it("worker access follows work types", () => {
    expect(grantsStall(staff("worker", ["stall_seller"]))).toBe(true);
    expect(grantsCourier(staff("worker", ["stall_seller"]))).toBe(false);
    expect(grantsCourier(staff("worker", ["courier"]))).toBe(true);
    expect(grantsAdmin(staff("worker", ["stall_seller", "courier"]))).toBe(false);
  });
  it("marketing gets none of the legacy areas", () => {
    const p = staff("marketing");
    expect([grantsAdmin(p), grantsStall(p), grantsCourier(p)]).toEqual([false, false, false]);
  });
  it("legacy kinds only grant their own area", () => {
    expect(grantsAdmin({ k: "stall", exp })).toBe(false);
    expect(grantsStall({ k: "stall", exp })).toBe(true);
    expect(grantsCourier({ k: "admin", exp })).toBe(false);
  });
});
