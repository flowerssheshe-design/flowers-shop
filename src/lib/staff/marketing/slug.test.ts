import { describe, expect, it } from "vitest";
import { isValidSlug, normalizeSlugInput, suggestSlug, SLUG_RE } from "./slug";

describe("isValidSlug", () => {
  it.each(["instagram-story", "flyer-merkaz", "wa2", "ab", "a1-b2-c3"])("accepts %s", (s) => {
    expect(isValidSlug(s)).toBe(true);
  });
  it.each(["", "a", "-abc", "abc-", "a--b", "Abc", "abc def", "שלום", "abc_def", "a".repeat(50), "../etc"])(
    "rejects %j",
    (s) => {
      expect(isValidSlug(s)).toBe(false);
    },
  );
  it("rejects non-strings", () => {
    expect(isValidSlug(undefined)).toBe(false);
    expect(isValidSlug(12)).toBe(false);
  });
  it("matches the DB check constraint", () => {
    expect(SLUG_RE.source).toBe("^[a-z0-9][a-z0-9-]{1,48}$");
  });
});

describe("suggestSlug", () => {
  it("lowercases english and turns spaces into dashes", () => {
    expect(suggestSlug("Instagram Story")).toBe("instagram-story");
  });
  it("transliterates hebrew", () => {
    expect(suggestSlug("פלאייר מרכז")).toBe("playyr-mrkz");
  });
  it("drops symbols and trims dashes", () => {
    expect(suggestSlug("  !!WhatsApp  group #1!! ")).toBe("whatsapp-group-1");
  });
  it("always returns a valid slug", () => {
    for (const name of ["", "!", "a", "אבג".repeat(40), "Flyer — Merkaz (2026)", "x".repeat(100) + "-y"]) {
      expect(isValidSlug(suggestSlug(name))).toBe(true);
    }
  });
  it("falls back for empty names", () => {
    expect(suggestSlug("")).toBe("link");
    expect(suggestSlug("a")).toBe("link-a");
  });
});

describe("normalizeSlugInput", () => {
  it("cleans typed input", () => {
    expect(normalizeSlugInput("My Flyer_1!")).toBe("my-flyer1");
  });
});
