import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getUserOrderStats } from "@/lib/auth";
import { getServerSettings } from "@/lib/settings-server";
import { DEFAULTS } from "@/lib/useSystemSettings.types";
import { POST } from "@/app/api/orders/route";

vi.mock("@/lib/auth", () => ({
  getUserOrderStats: vi.fn(),
}));
vi.mock("@/lib/settings-server", () => ({
  getServerSettings: vi.fn(),
}));
vi.mock("@/lib/storeMode", () => ({
  getStoreMode: vi.fn().mockResolvedValue("realtime"),
  isRealtimeMode: () => true,
}));

const ROSE = "11111111-1111-4111-8111-111111111111";
const TULIP = "22222222-2222-4222-8222-222222222222";

type ProductRow = {
  id: string;
  title: string;
  price_standard: number;
  image_url: string | null;
  is_active: boolean;
};

const DB_PRODUCTS: ProductRow[] = [
  { id: ROSE, title: "זר ורדים", price_standard: 155, image_url: null, is_active: true },
  { id: TULIP, title: "זר צבעונים", price_standard: 100, image_url: null, is_active: true },
];

let insertedOrder: Record<string, unknown> | null;

function makeAdmin(products: ProductRow[]) {
  return {
    from: (table: string) => {
      if (table === "products") {
        return {
          select: () => ({
            in: (_col: string, ids: string[]) =>
              Promise.resolve({
                data: products.filter((p) => ids.includes(p.id)),
                error: null,
              }),
          }),
        };
      }
      if (table === "orders") {
        return {
          insert: (row: Record<string, unknown>) => {
            insertedOrder = row;
            return {
              select: () => ({
                single: () =>
                  Promise.resolve({ data: { id: "order-1", ...row }, error: null }),
              }),
            };
          },
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
          delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      }
      // profiles
      return {
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      };
    },
    rpc: vi.fn().mockResolvedValue({ data: 10, error: null }),
  };
}

function mockUser(id: string | null) {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: () => Promise.resolve({ data: { user: id ? { id } : null } }),
    },
  } as never);
}

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function order(overrides: Record<string, unknown> = {}) {
  return {
    customer_name: "ישראל ישראלי",
    customer_phone: "0501234567",
    delivery_address: null,
    items: [
      { productId: ROSE, title: "זר ורדים", qty: 2, price: 155 },
      { productId: TULIP, title: "זר צבעונים", qty: 1, price: 100 },
    ],
    total_amount: 410,
    delivery_type: "pickup",
    delivery_fee: 0,
    is_member: false,
    payment_method: "bit",
    ...overrides,
  };
}

describe("POST /api/orders server-side pricing", () => {
  beforeEach(() => {
    insertedOrder = null;
    vi.mocked(createAdminClient).mockReturnValue(makeAdmin(DB_PRODUCTS) as never);
    vi.mocked(getServerSettings).mockResolvedValue({ ...DEFAULTS, delivery_fee: 20 });
    vi.mocked(getUserOrderStats).mockResolvedValue({
      completedCount: 0,
      qualifies: false,
      discountPercent: 0,
      threshold: 3,
      memberPercent: 10,
      personalPercent: 0,
      customerStatus: null,
    });
    mockUser(null);
  });

  it("stores DB prices and the server total for an anonymous order", async () => {
    const res = await POST(request(order()));
    expect(res.status).toBe(201);
    expect(insertedOrder?.total_amount).toBe(410);
    expect(insertedOrder?.delivery_fee).toBe(0);
    expect(insertedOrder?.is_member).toBe(false);
    expect(insertedOrder?.items).toEqual([
      { productId: ROSE, title: "זר ורדים", qty: 2, price: 155, image_url: null },
      { productId: TULIP, title: "זר צבעונים", qty: 1, price: 100, image_url: null },
    ]);
  });

  it("rejects a tampered total with 409 and does not insert", async () => {
    const res = await POST(
      request(
        order({
          items: [
            { productId: ROSE, title: "זר ורדים", qty: 2, price: 1 },
            { productId: TULIP, title: "זר צבעונים", qty: 1, price: 1 },
          ],
          total_amount: 3,
        }),
      ),
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "המחירים התעדכנו. רעננו את הדף ונסו שוב.",
    });
    expect(insertedOrder).toBeNull();
  });

  it("ignores client item prices/titles when the total matches", async () => {
    const res = await POST(
      request(
        order({
          items: [{ productId: ROSE, title: "fake", qty: 1, price: 1 }],
          total_amount: 155,
          is_member: true,
        }),
      ),
    );
    expect(res.status).toBe(201);
    expect(insertedOrder?.items).toEqual([
      { productId: ROSE, title: "זר ורדים", qty: 1, price: 155, image_url: null },
    ]);
    expect(insertedOrder?.is_member).toBe(false);
  });

  it("applies the logged-in user's discount and settings delivery fee", async () => {
    mockUser("user-1");
    vi.mocked(getUserOrderStats).mockResolvedValue({
      completedCount: 0,
      qualifies: true,
      discountPercent: 10,
      threshold: 3,
      memberPercent: 10,
      personalPercent: 0,
      customerStatus: "returning",
    });
    // 2 x 140 + 1 x 90 + 20 delivery
    const res = await POST(
      request(
        order({
          delivery_type: "delivery",
          delivery_address: "רחוב הדקל 5",
          delivery_fee: 0,
          total_amount: 390,
        }),
      ),
    );
    expect(res.status).toBe(201);
    expect(getUserOrderStats).toHaveBeenCalledWith("user-1");
    expect(insertedOrder?.total_amount).toBe(390);
    expect(insertedOrder?.delivery_fee).toBe(20);
    expect(insertedOrder?.is_member).toBe(true);
    expect((insertedOrder?.items as { price: number }[]).map((i) => i.price)).toEqual([
      140, 90,
    ]);
  });

  it("rejects unknown or inactive products with 400", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeAdmin([DB_PRODUCTS[0], { ...DB_PRODUCTS[1], is_active: false }]) as never,
    );
    const res = await POST(request(order()));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "אחד המוצרים אינו זמין יותר" });
    expect(insertedOrder).toBeNull();
  });
});
