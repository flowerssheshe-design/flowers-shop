import { describe, expect, it } from "vitest";
import { isIosDevice, isPromptPath, isSnoozed, promptMode, PROMPT_SNOOZE_MS } from "./push-prompt";

const base = {
  pathname: "/",
  dismissedAt: null,
  now: 1_800_000_000_000,
  vapidKey: "BKey",
  ios: false,
  standalone: false,
  pushSupported: true,
  permission: "default" as NotificationPermission,
};

describe("push prompt", () => {
  it("never on staff/back-office or auth pages", () => {
    for (const p of ["/staff", "/staff/marketing", "/admin", "/stall", "/courier", "/go/x", "/login", "/checkout"]) {
      expect(isPromptPath(p)).toBe(false);
      expect(promptMode({ ...base, pathname: p })).toBe("hidden");
    }
    expect(isPromptPath("/")).toBe(true);
  });
  it("asks on a normal browser", () => {
    expect(promptMode(base)).toBe("ask");
  });
  it("stays hidden for 30 days after dismissal", () => {
    expect(promptMode({ ...base, dismissedAt: String(base.now - 1000) })).toBe("hidden");
    expect(promptMode({ ...base, dismissedAt: String(base.now - PROMPT_SNOOZE_MS - 1) })).toBe("ask");
    expect(isSnoozed("garbage", base.now)).toBe(false);
  });
  it("explains Add to Home Screen on iOS Safari when not installed", () => {
    expect(promptMode({ ...base, ios: true, standalone: false, pushSupported: false })).toBe("ios_install");
    expect(promptMode({ ...base, ios: true, standalone: true })).toBe("ask");
  });
  it("hidden without VAPID key, support, or after a decision", () => {
    expect(promptMode({ ...base, vapidKey: "" })).toBe("hidden");
    expect(promptMode({ ...base, pushSupported: false })).toBe("hidden");
    expect(promptMode({ ...base, permission: "granted" })).toBe("hidden");
    expect(promptMode({ ...base, permission: "denied" })).toBe("hidden");
  });
  it("detects iOS incl. iPadOS", () => {
    expect(isIosDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe(true);
    expect(isIosDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe(true);
    expect(isIosDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0)).toBe(false);
    expect(isIosDevice("Mozilla/5.0 (Linux; Android 14)")).toBe(false);
  });
});
