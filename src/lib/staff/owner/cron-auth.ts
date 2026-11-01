import { timingSafeEqual } from "node:crypto";

/** Bearer token check against CRON_SECRET. Fails closed when the secret is unset or too short. */
export function isAuthorizedCron(header: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 16) return false;
  const match = /^Bearer\s+(.+)$/.exec(header ?? "");
  if (!match) return false;
  const a = Buffer.from(match[1].trim());
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
