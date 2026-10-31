import { vi } from "vitest";
import "@testing-library/jest-dom";

// Mock Next.js server-only modules
vi.mock("server-only", () => ({}));

// Mock next/headers — cookie values come from a mutable jar (src/test/cookie-mock.ts).
// Default jar: { flowers_stall_auth: "1" } (an unsigned legacy value, which is no
// longer accepted by the auth helpers). Use setTestCookies() to change it.
vi.mock("next/headers", async () => {
  const { testCookies } = await import("./cookie-mock");
  return {
    cookies: () => ({
      get: (name: string) => {
        const value = testCookies.get(name);
        return value === undefined ? undefined : { name, value };
      },
    }),
  };
});

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
}));

// Mock Supabase admin client
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

// Mock Supabase server client
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

// Mock constants
vi.mock("@/lib/constants", () => ({
  SUPABASE_CONFIGURED: true,
  SUPABASE_URL: "http://localhost:54321",
  SUPABASE_ANON_KEY: "test-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  CLUB_DISCOUNT_THRESHOLD: 3,
  MEMBER_DISCOUNT_PERCENT: 10,
  DELIVERY_FEE: 15,
  WHATSAPP_NUMBER: "972500000000",
  BIT_NUMBER: "1234567890",
  PAYBOX_NUMBER: "",
  PICKUP_ADDRESS: "רחוב מבחן 1",
  BUSINESS_PHONE: "050-1234567",
  BUSINESS_EMAIL: "test@example.com",
  BUSINESS_HOURS: "sun-thu 08:00-18:00",
  SITE_URL: "http://localhost:3000",
  ADMIN_PIN: "1234",
  STALL_PIN: "5678",
  COURIER_PIN: "9012",
}));

// Mock storeMode
vi.mock("@/lib/storeMode", () => ({
  getStoreMode: vi.fn().mockResolvedValue("realtime"),
  isRealtimeMode: () => true,
}));