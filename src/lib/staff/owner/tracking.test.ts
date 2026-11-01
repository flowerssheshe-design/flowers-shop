import { describe, it, expect, vi } from "vitest";
import { isUuid, resolveTrackingLinkId } from "./tracking";

const ID = "3f2b8c1e-9a4d-4c2b-8e1f-0a1b2c3d4e5f";

function admin(row: { id: string; is_active: boolean } | null, error: unknown = null) {
  const eq = vi.fn().mockReturnValue({ maybeSingle: () => Promise.resolve({ data: row, error }) });
  const from = vi.fn().mockReturnValue({ select: () => ({ eq }) });
  return { from, eq };
}

describe("tracking link validation", () => {
  it("recognises uuids", () => {
    expect(isUuid(ID)).toBe(true);
    expect(isUuid("instagram-story")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });

  it("ignores a non-uuid cookie without querying", async () => {
    const a = admin({ id: ID, is_active: true });
    expect(await resolveTrackingLinkId(a, "'; drop table orders;--")).toBeNull();
    expect(a.from).not.toHaveBeenCalled();
  });

  it("accepts an existing active link", async () => {
    const a = admin({ id: ID, is_active: true });
    expect(await resolveTrackingLinkId(a, ID.toUpperCase())).toBe(ID);
    expect(a.from).toHaveBeenCalledWith("tracking_links");
    expect(a.eq).toHaveBeenCalledWith("id", ID);
  });

  it("ignores an inactive or unknown link, and DB errors", async () => {
    expect(await resolveTrackingLinkId(admin({ id: ID, is_active: false }), ID)).toBeNull();
    expect(await resolveTrackingLinkId(admin(null), ID)).toBeNull();
    expect(await resolveTrackingLinkId(admin(null, { message: "boom" }), ID)).toBeNull();
    const throwing = { from: () => { throw new Error("x"); } };
    expect(await resolveTrackingLinkId(throwing, ID)).toBeNull();
  });
});
