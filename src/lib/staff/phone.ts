/**
 * Normalizes an Israeli phone number to local digits starting with 0.
 * "+972 50-123-4567" → "0501234567", "050-1234567" → "0501234567".
 * Returns null when the result is not a plausible local number (9–10 digits).
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("00972")) digits = digits.slice(5);
  else if (digits.startsWith("972")) digits = digits.slice(3);
  if (!digits.startsWith("0")) digits = `0${digits}`;
  if (!/^0\d{8,9}$/.test(digits)) return null;
  return digits;
}
