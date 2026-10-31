// Mutable cookie jar backing the global `next/headers` mock in setup.ts.
// Tests can call setTestCookies({...}) / resetTestCookies().

const DEFAULT_COOKIES: Record<string, string> = { flowers_stall_auth: "1" };

export const testCookies = new Map<string, string>(Object.entries(DEFAULT_COOKIES));

export function setTestCookies(values: Record<string, string>) {
  testCookies.clear();
  for (const [k, v] of Object.entries(values)) testCookies.set(k, v);
}

export function resetTestCookies() {
  setTestCookies(DEFAULT_COOKIES);
}
