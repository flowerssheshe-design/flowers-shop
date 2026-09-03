import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/constants";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

/**
 * Use inside Server Components (read-only). Cookie writes are best-effort
 * and silently no-op when called outside a Route Handler / Server Action.
 */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(_items: CookieToSet[]) {
        try {
          // No-op: Server Components can't write cookies.
        } catch {
          // ignored
        }
      },
    },
  });
}

/**
 * Use inside Route Handlers / Server Actions. Returns the Supabase client AND
 * the list of cookies it tried to set, so the caller can attach them to the
 * outgoing NextResponse. This is what makes @supabase/ssr persist the session
 * across requests.
 */
export async function createClientForRoute(): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>;
  cookiesToSet: CookieToSet[];
}> {
  const cookieStore = await cookies();
  const cookiesToSet: CookieToSet[] = [];

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(items: CookieToSet[]) {
        cookiesToSet.push(...items);
      },
    },
  });

  return { supabase, cookiesToSet };
}

export function applyCookies(
  response: Response,
  cookiesToSet: CookieToSet[],
): Response {
  for (const { name, value, options } of cookiesToSet) {
    const parts = [`${name}=${value}`];
    if (options?.path) parts.push(`Path=${options.path}`);
    if (options?.maxAge != null) parts.push(`Max-Age=${options.maxAge}`);
    if (options?.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
    if (options?.httpOnly) parts.push("HttpOnly");
    if (options?.secure) parts.push("Secure");
    if (options?.sameSite)
      parts.push(`SameSite=${options.sameSite}`);
    if (options?.domain) parts.push(`Domain=${options.domain}`);
    response.headers.append("Set-Cookie", parts.join("; "));
  }
  return response;
}