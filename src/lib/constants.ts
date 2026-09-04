export const DELIVERY_FEE = Number(process.env.NEXT_PUBLIC_DELIVERY_FEE ?? 15);
export const WHATSAPP_NUMBER =
  process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "972500000000";
export const BIT_NUMBER = process.env.NEXT_PUBLIC_BIT_NUMBER ?? "";
export const PAYBOX_NUMBER = process.env.NEXT_PUBLIC_PAYBOX_NUMBER ?? "";

export const WHATSAPP_API_TOKEN = process.env.WHATSAPP_API_TOKEN ?? "";
export const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID ?? "";
export const WHATSAPP_API_VERSION = process.env.WHATSAPP_API_VERSION ?? "v18.0";
export const WHATSAPP_MAX_TEXT_LENGTH = 4096;
export const WHATSAPP_CONFIGURED = Boolean(
  WHATSAPP_API_TOKEN && WHATSAPP_PHONE_ID,
);

export const PICKUP_ADDRESS =
  process.env.NEXT_PUBLIC_PICKUP_ADDRESS ?? "נחל חתירה 10,ירוחם";
export const BUSINESS_PHONE =
  process.env.NEXT_PUBLIC_BUSINESS_PHONE ?? "05-32455705";
export const BUSINESS_EMAIL =
  process.env.NEXT_PUBLIC_BUSINESS_EMAIL ?? "flowerssheshe@gmail.com";
export const BUSINESS_HOURS =
  process.env.NEXT_PUBLIC_BUSINESS_HOURS ?? "ראשון-חמישי 08:00-18:00, שישי 08:00-14:00";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export const SUPABASE_CONFIGURED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const CLUB_DISCOUNT_THRESHOLD = Number(
  process.env.NEXT_PUBLIC_CLUB_DISCOUNT_THRESHOLD ?? 3,
);
export const MEMBER_DISCOUNT_PERCENT = Number(
  process.env.NEXT_PUBLIC_MEMBER_DISCOUNT_PERCENT ?? 10,
);