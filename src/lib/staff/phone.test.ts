import { describe, expect, it } from "vitest";
import { normalizePhone } from "@/lib/staff/phone";

describe("normalizePhone", () => {
  it.each([
    ["+972 50-123-4567", "0501234567"],
    ["972501234567", "0501234567"],
    ["00972501234567", "0501234567"],
    ["050-123-4567", "0501234567"],
    ["0501234567", "0501234567"],
    ["501234567", "0501234567"],
    ["08-6571234", "086571234"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(["", "abc", "123", "05012345678901", null, undefined])("rejects %s", (input) => {
    expect(normalizePhone(input as string)).toBeNull();
  });
});
