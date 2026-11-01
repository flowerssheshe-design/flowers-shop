import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getServerSettings } from "@/lib/settings-server";
import { getStoreMode } from "@/lib/storeMode";
import { DEFAULTS } from "@/lib/useSystemSettings.types";
import { resetTestCookies, setTestCookies } from "@/test/cookie-mock";
import { POST } from "@/app/api/orders/route";

// order_type from the week phase, and tracking_link_id from the flowers_ref cookie.

vi.mock("@/lib/auth", () => ({ getUserOrderStats: vi.fn() }));
vi.mock("@/lib/settings-server", () => ({ getServerSettings: vi.fn() }));
vi.mock("@/lib/storeMode", () => ({
  getStoreMode: vi.fn(),
  isRealtimeMode: (m: string) => m === "realtime",
}));

const ROSE = "11111111-1111-4111-8111-111111111111";
const LINK = "3f2b8c1e-9a4d-4c2b-8e1f-0a1b2c3d4e5f";

let inserted: Record<string, unknown>[];
let rpc: ReturnType<typeof vi.fn>;
let links: Record<string, { id: string; is_active: boolean }>;

function makeAdmin() {
  rpc = vi.fn().mockResolvedValue({ data: 5, error: null });
  return {
    from: (table: string) => {
      if (table === "products") {
        return {
          select: () => ({
            in: () =>
              Promise.resolve({
                data: [{ id: ROSE, title: "זר ורדים", price_standard: 100, image_url: null, is_active: true }],
                error: null,
              }),
          }),
        };
      }
      if (table === "tracking_links") {
        return {
          select: () => ({
            eq: (_c: string, id: string) => ({ maybeSingle: () => Promise.resolve({ data: links[id] ?? null, error: null }) }),
          }),
        };
      }
      if (table === "orders") {
        return {
          insert: (row: Record<string, unknown>) => {
            inserted.push(row);
            return { select: () => ({ single: () => Promise.resolve({ data: { id: "order-1", ...row }, error: null }) }) };
          },
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
          delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      }
      return { update: () => ({ eq: () => Promise.resolve({ error: null }) }) };
    },
    rpc,
  };
}

function request() {
  return new Request("http://localhost/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customer_name: "ישראל ישראלי",
      customer_phone: "0501234567",
      items: [{ productId: ROSE, title: "זר ורדים", qty: 1, price: 100 }],
      total_amount: 100,
      delivery_type: "pickup",
      delivery_fee: 0,
      is_member: false,
      payment_method: "bit",
    }),
  });
}

describe("POST /api/orders: order type and tracking link", () => {
  beforeEach(() => {
    inserted = [];
    links = { [LINK]: { id: LINK, is_active: true } };
    vi.mocked(createAdminClient).mockImplementation(() => makeAdmin() as never);
    vi.mocked(getServerSettings).mockResolvedValue({ ...DEFAULTS });
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
    } as never);
  });
  afterEach(() => resetTestCookies());

  it("pre-order phase → order_type 'preorder', no stock deduction", async () => {
    vi.mocked(getStoreMode).mockResolvedValue("preorder");
    const res = await POST(request());
    expect(res.status).toBe(201);
    expect(inserted[0].order_type).toBe("preorder");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("live phase → order_type 'live' and stock is deducted", async () => {
    vi.mocked(getStoreMode).mockResolvedValue("realtime");
    const res = await POST(request());
    expect(res.status).toBe(201);
    expect(inserted[0].order_type).toBe("live");
    expect(rpc).toHaveBeenCalledWith("decrement_inventory", { p_product_id: ROSE, p_qty: 1 });
  });

  it("stores an active tracking link from the cookie", async () => {
    vi.mocked(getStoreMode).mockResolvedValue("preorder");
    setTestCookies({ flowers_ref: LINK });
    await POST(request());
    expect(inserted[0].tracking_link_id).toBe(LINK);
  });

  it("ignores an inactive, unknown or malformed tracking cookie", async () => {
    vi.mocked(getStoreMode).mockResolvedValue("preorder");
    links[LINK].is_active = false;
    setTestCookies({ flowers_ref: LINK });
    await POST(request());
    setTestCookies({ flowers_ref: "9f2b8c1e-9a4d-4c2b-8e1f-0a1b2c3d4e5f" });
    await POST(request());
    setTestCookies({ flowers_ref: "instagram" });
    await POST(request());
    expect(inserted.map((r) => r.tracking_link_id)).toEqual([null, null, null]);
  });
});
