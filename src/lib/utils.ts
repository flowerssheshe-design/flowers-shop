import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatILS(value: number | null | undefined): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format((value as number) || 0);
}

export function calculateMemberPrice(
  standardPrice: number,
  discountPercent = 10,
): number {
  return Math.round((standardPrice * (100 - discountPercent)) / 100);
}

export function calculateDiscountAmount(
  standardPrice: number,
  discountPercent = 10,
): number {
  return Math.round((standardPrice * discountPercent) / 100);
}

export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("972")) return "0" + digits.slice(3);
  return digits;
}

export function buildWhatsAppLink(
  phone: string,
  message: string,
): string {
  const cleaned = phone.replace(/\D/g, "");
  return `https://wa.me/${cleaned}?text=${encodeURIComponent(message)}`;
}

export function isBitUrl(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("bit://")
  );
}

export function buildBitLink(
  bitValue: string,
  amount: number,
  note: string,
): string {
  const trimmed = bitValue.trim();
  
  if (isBitUrl(trimmed)) {
    const url = new URL(trimmed);
    url.searchParams.set("amount", amount.toFixed(2));
    if (note) {
      url.searchParams.set("note", note);
    }
    return url.toString();
  }
  
  const cleaned = trimmed.replace(/\D/g, "");
  const normalized = cleaned.startsWith("972")
    ? cleaned
    : cleaned.startsWith("0")
      ? "972" + cleaned.slice(1)
      : cleaned;
  const params = new URLSearchParams({
    phone: normalized,
    amount: amount.toFixed(2),
    note,
  });
  return `bit://pay?${params.toString()}`;
}

export function normalizeWhatsAppRecipient(
  phone: string | null | undefined,
): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return null;
  if (digits.startsWith("0")) return "972" + digits.slice(1);
  return digits;
}