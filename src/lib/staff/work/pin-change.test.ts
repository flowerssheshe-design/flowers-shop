import { describe, expect, it } from "vitest";
import { PIN_LOCK_MINUTES, checkPinChangeInput, failedPinUpdate, isPinLocked } from "./pin-change";

const ok = { current_pin: "1234", new_pin: "567890", new_pin_confirm: "567890" };

describe("PIN change validation", () => {
  it("accepts a valid change", () => {
    expect(checkPinChangeInput(ok)).toBeNull();
    expect(checkPinChangeInput({ ...ok, new_pin: "4321", new_pin_confirm: "4321" })).toBeNull();
    expect(checkPinChangeInput({ ...ok, new_pin: "12345678", new_pin_confirm: "12345678" })).toBeNull();
  });

  it("needs the current PIN and a new one", () => {
    expect(checkPinChangeInput({ ...ok, current_pin: "" })).toMatch(/הנוכחי/);
    expect(checkPinChangeInput({ ...ok, new_pin: "", new_pin_confirm: "" })).toMatch(/חדש/);
    expect(checkPinChangeInput(null)).not.toBeNull();
  });

  it("needs 4 to 8 digits", () => {
    for (const bad of ["123", "123456789", "12a4", "12 34"]) {
      expect(checkPinChangeInput({ ...ok, new_pin: bad, new_pin_confirm: bad })).toMatch(/4 עד 8/);
    }
  });

  it("needs the new PIN typed twice", () => {
    expect(checkPinChangeInput({ ...ok, new_pin_confirm: "567891" })).toMatch(/לא תואמים/);
  });

  it("must differ from the current PIN", () => {
    expect(checkPinChangeInput({ current_pin: "1234", new_pin: "1234", new_pin_confirm: "1234" })).toMatch(/זהה/);
  });
});

describe("PIN change lockout (same as login)", () => {
  const now = new Date("2026-11-01T10:00:00Z");

  it("counts failures and locks on the fifth for 15 minutes", () => {
    expect(failedPinUpdate(null, now)).toEqual({ locked: false, update: { failed_pin_attempts: 1 } });
    expect(failedPinUpdate(3, now)).toEqual({ locked: false, update: { failed_pin_attempts: 4 } });
    const fifth = failedPinUpdate(4, now);
    expect(fifth.locked).toBe(true);
    expect(fifth.update.failed_pin_attempts).toBe(0);
    expect(new Date(fifth.update.locked_until!).getTime() - now.getTime()).toBe(PIN_LOCK_MINUTES * 60_000);
  });

  it("knows when the account is locked", () => {
    expect(isPinLocked(null, now)).toBe(false);
    expect(isPinLocked("2026-11-01T10:05:00Z", now)).toBe(true);
    expect(isPinLocked("2026-11-01T09:59:00Z", now)).toBe(false);
  });
});
