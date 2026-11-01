// Links for the courier: phone, WhatsApp, navigation.
import { normalizeWhatsAppRecipient } from "@/lib/utils";

export function telLink(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

export function whatsappLink(phone: string, message = ""): string | null {
  const to = normalizeWhatsAppRecipient(phone);
  if (!to) return null;
  return message ? `https://wa.me/${to}?text=${encodeURIComponent(message)}` : `https://wa.me/${to}`;
}

/** Adds the town when the customer typed only a street, so navigation finds it. */
export function navAddress(address: string, town = "ירוחם"): string {
  const a = address.trim();
  return a.includes(town) ? a : `${a}, ${town}`;
}

export function wazeLink(address: string): string {
  return `https://waze.com/ul?q=${encodeURIComponent(navAddress(address))}&navigate=yes`;
}

export function googleMapsLink(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(navAddress(address))}`;
}
