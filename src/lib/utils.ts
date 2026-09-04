import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { MEMBER_DISCOUNT_PERCENT } from "@/lib/constants";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatILS(value: number): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

export function calculateMemberPrice(
  standardPrice: number,
  discountPercent = MEMBER_DISCOUNT_PERCENT,
): number {
  return Math.round((standardPrice * (100 - discountPercent)) / 100);
}

export function calculateDiscountAmount(
  standardPrice: number,
  discountPercent = MEMBER_DISCOUNT_PERCENT,
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

export function normalizeWhatsAppRecipient(
  phone: string | null | undefined,
): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return null;
  if (digits.startsWith("0")) return "972" + digits.slice(1);
  return digits;
}