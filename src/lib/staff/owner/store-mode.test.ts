import { describe, it, expect } from "vitest";
import { orderTypeForMode, parseStoreModeSetting, resolveStoreMode } from "./store-mode";
import { isAuthorizedCron } from "./cron-auth";

describe("store mode", () => {
  it("treats a missing or unknown value as auto", () => {
    expect(parseStoreModeSetting(undefined)).toBe("auto");
    expect(parseStoreModeSetting(null)).toBe("auto");
    expect(parseStoreModeSetting("weird")).toBe("auto");
    expect(parseStoreModeSetting("auto")).toBe("auto");
    expect(parseStoreModeSetting("realtime")).toBe("realtime");
    expect(parseStoreModeSetting({ value: "preorder" })).toBe("preorder");
    expect(parseStoreModeSetting('"realtime"')).toBe("realtime");
  });

  it("auto follows the week phase", () => {
    expect(resolveStoreMode("auto", "preorder")).toBe("preorder");
    expect(resolveStoreMode("auto", "live")).toBe("realtime");
  });

  it("a manual override wins over the phase", () => {
    expect(resolveStoreMode("preorder", "live")).toBe("preorder");
    expect(resolveStoreMode("realtime", "preorder")).toBe("realtime");
  });
});

describe("order_type selection", () => {
  it("live sale → 'live', pre-orders → 'preorder'", () => {
    expect(orderTypeForMode("realtime")).toBe("live");
    expect(orderTypeForMode("preorder")).toBe("preorder");
    expect(orderTypeForMode(undefined)).toBe("preorder");
  });

  it("follows the phase end to end", () => {
    expect(orderTypeForMode(resolveStoreMode("auto", "live"))).toBe("live");
    expect(orderTypeForMode(resolveStoreMode("auto", "preorder"))).toBe("preorder");
  });
});

describe("cron auth", () => {
  const secret = "s3cret-s3cret-s3cret";
  it("fails closed without a secret", () => {
    expect(isAuthorizedCron(`Bearer ${secret}`, undefined)).toBe(false);
    expect(isAuthorizedCron("Bearer ", "")).toBe(false);
  });
  it("accepts only the exact bearer token", () => {
    expect(isAuthorizedCron(`Bearer ${secret}`, secret)).toBe(true);
    expect(isAuthorizedCron(`Bearer ${secret}x`, secret)).toBe(false);
    expect(isAuthorizedCron(secret, secret)).toBe(false);
    expect(isAuthorizedCron(null, secret)).toBe(false);
  });
});
