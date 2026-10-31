// Edge-runtime (Web Crypto) verifier for tokens produced by signed-token.ts.
// MUST NOT import node:* modules: used by src/middleware.ts.
import {
  getSessionSecret,
  validatePayload,
  type TokenPayload,
} from "@/lib/signed-token-shared";

export * from "@/lib/signed-token-shared";

function base64UrlToBytes(s: string): ArrayBuffer | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  try {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
    const bin = atob(b64);
    const buf = new ArrayBuffer(bin.length);
    const out = new Uint8Array(buf);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return buf;
  } catch {
    return null;
  }
}

const keyCache = new Map<string, Promise<CryptoKey>>();

function getKey(secret: string): Promise<CryptoKey> {
  let k = keyCache.get(secret);
  if (!k) {
    k = crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    keyCache.set(secret, k);
  }
  return k;
}

export async function verifyTokenEdge(
  token: string | undefined | null,
): Promise<TokenPayload | null> {
  if (!token || typeof token !== "string" || token.length > 4096) return null;
  const secret = getSessionSecret();
  if (!secret) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [body, sigPart] = parts;
  const sig = base64UrlToBytes(sigPart);
  const bodyBytes = base64UrlToBytes(body);
  if (!sig || !bodyBytes || sig.byteLength !== 32) return null;
  try {
    const key = await getKey(secret);
    // crypto.subtle.verify performs a constant-time comparison.
    const ok = await crypto.subtle.verify("HMAC", key, sig, new TextEncoder().encode(body));
    if (!ok) return null;
    const json = JSON.parse(new TextDecoder().decode(bodyBytes));
    return validatePayload(json);
  } catch {
    return null;
  }
}
