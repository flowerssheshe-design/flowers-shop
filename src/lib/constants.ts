export const DELIVERY_FEE = Number(process.env.NEXT_PUBLIC_DELIVERY_FEE ?? 15);
export const WHATSAPP_NUMBER =
  process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "972500000000";
export const BIT_NUMBER = process.env.NEXT_PUBLIC_BIT_NUMBER ?? "";
export const PAYBOX_NUMBER = process.env.NEXT_PUBLIC_PAYBOX_NUMBER ?? "";

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