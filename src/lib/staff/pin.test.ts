// @vitest-environment node
import { describe, expect, it } from "vitest";
import { hashPin, isValidPinFormat, verifyPin } from "@/lib/staff/pin";

describe("staff pin", () => {
  it("hashes in scrypt$salt$hash format and verifies", async () => {
    const hash = await hashPin("1234");
    const [algo, salt, key] = hash.split("$");
    expect(algo).toBe("scrypt");
    expect(Buffer.from(salt, "base64")).toHaveLength(16);
    expect(Buffer.from(key, "base64")).toHaveLength(64);
    expect(await verifyPin("1234", hash)).toBe(true);
    expect(await verifyPin("1235", hash)).toBe(false);
  });

  it("uses a random salt", async () => {
    expect(await hashPin("12345678")).not.toBe(await hashPin("12345678"));
  });

  it("enforces 4-8 digits", async () => {
    expect(isValidPinFormat("123")).toBe(false);
    expect(isValidPinFormat("123456789")).toBe(false);
    expect(isValidPinFormat("12a4")).toBe(false);
    expect(isValidPinFormat("0000")).toBe(true);
    await expect(hashPin("12")).rejects.toThrow();
  });

  it("rejects malformed stored hashes", async () => {
    for (const h of ["", null, undefined, "plain", "scrypt$abc", "bcrypt$a$b"]) {
      expect(await verifyPin("1234", h)).toBe(false);
    }
  });
});
