// Staff PIN hashing. Format: scrypt$<saltB64>$<hashB64> (16-byte salt, 64-byte key).
// NOTE: scripts/create-staff.mjs duplicates hashPin — keep the two in sync.
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const SALT_BYTES = 16;
const KEY_BYTES = 64;
const PIN_RE = /^\d{4,8}$/;

export function isValidPinFormat(pin: string): boolean {
  return typeof pin === "string" && PIN_RE.test(pin);
}

function scryptAsync(pin: string, salt: Buffer, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(pin, salt, keylen, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPin(pin: string): Promise<string> {
  if (!isValidPinFormat(pin)) {
    throw new Error("PIN must be 4-8 digits");
  }
  const salt = randomBytes(SALT_BYTES);
  const key = await scryptAsync(pin, salt, KEY_BYTES);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPin(pin: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored || typeof stored !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "base64");
  const expected = Buffer.from(parts[2], "base64");
  if (salt.length !== SALT_BYTES || expected.length !== KEY_BYTES) return false;
  // Still derive a key for malformed PINs so timing doesn't reveal the format check.
  const actual = await scryptAsync(isValidPinFormat(pin) ? pin : "x", salt, KEY_BYTES);
  return timingSafeEqual(actual, expected) && isValidPinFormat(pin);
}

/** Burns roughly the same CPU as a real verify — used for unknown accounts. */
let dummyHash: Promise<string> | null = null;
export async function verifyPinDummy(pin: string): Promise<false> {
  dummyHash ??= hashPin("00000000");
  await verifyPin(pin, await dummyHash);
  return false;
}
