import { describe, expect, it } from "vitest";
import { GROUP_ORDER, SECTIONS, allowedSections, homeHref, menuSections, type StaffIdentity } from "./access";

const topicsOf = (who: StaffIdentity) => {
  const groups = new Set(menuSections(who).map((s) => s.group));
  return GROUP_ORDER.filter((g) => groups.has(g));
};

describe("staff menu topics", () => {
  it("every section belongs to a known topic", () => {
    for (const s of SECTIONS) expect(GROUP_ORDER).toContain(s.group);
  });

  it("owners see every topic and land on this week", () => {
    const owner: StaffIdentity = { role: "owner", work_types: [] };
    expect(topicsOf(owner)).toEqual(GROUP_ORDER);
    expect(homeHref(owner)).toBe("/staff");
  });

  it("the shift manager gets stalls, orders, team and stock, and lands on orders", () => {
    const ops: StaffIdentity = { role: "ops_manager", work_types: [] };
    expect(topicsOf(ops)).toEqual(["stall", "orders", "team", "products"]);
    expect(homeHref(ops)).toBe("/staff/orders");
  });

  it("a stall seller sees only selling and their own area, and lands on the stall", () => {
    const seller: StaffIdentity = { role: "worker", work_types: ["stall_seller"] };
    expect(allowedSections(seller).map((s) => s.key)).toEqual(["stall", "me"]);
    expect(homeHref(seller)).toBe("/staff/stall");
  });

  it("a courier lands on deliveries; marketing on its data", () => {
    expect(homeHref({ role: "worker", work_types: ["courier"] })).toBe("/staff/deliveries");
    expect(homeHref({ role: "marketing", work_types: [] })).toBe("/staff/marketing");
    expect(topicsOf({ role: "marketing", work_types: [] })).toEqual(["marketing"]);
  });
});

describe("responsibilities and work types are separate", () => {
  it("a shift manager who is also the marketing lead gets both areas", () => {
    const both: StaffIdentity = { role: "ops_manager", roles: ["ops_manager", "marketing"], work_types: [] };
    const keys = allowedSections(both).map((s) => s.key);
    expect(keys).toContain("schedule");
    expect(keys).toContain("marketing_whatsapp");
    expect(keys).not.toContain("money");
  });

  it("a marketing lead who also sells at the stall gets the stall and my area", () => {
    const m: StaffIdentity = { role: "marketing", roles: ["marketing"], work_types: ["stall_seller"] };
    const keys = allowedSections(m).map((s) => s.key);
    expect(keys).toEqual(expect.arrayContaining(["stall", "me", "marketing"]));
    expect(keys).not.toContain("orders");
  });
});

describe("menu vs. access", () => {
  it("'my area' is open to everyone but not listed in the menu", () => {
    const seller: StaffIdentity = { role: "worker", work_types: ["stall_seller"] };
    expect(allowedSections(seller).map((s) => s.key)).toContain("me");
    expect(menuSections(seller).map((s) => s.key)).toEqual(["stall"]);
  });

  it("the shift manager staffs Friday from stalls; the weekly grid is owners-only in the menu", () => {
    const ops: StaffIdentity = { role: "ops_manager", work_types: [] };
    expect(allowedSections(ops).map((s) => s.key)).toContain("schedule"); // API access stays
    expect(menuSections(ops).map((s) => s.key)).not.toContain("schedule");
    expect(menuSections({ role: "owner", work_types: [] }).map((s) => s.key)).toContain("schedule");
  });
});
