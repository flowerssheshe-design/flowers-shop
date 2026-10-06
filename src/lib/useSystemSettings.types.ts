export type SystemSettings = {
  delivery_fee?: number;
  club_discount_threshold?: number;
  member_discount_percent?: number;
  bit_number?: string;
  paybox_number?: string;
  whatsapp_number?: string;
  business_phone?: string;
  contact_phone?: string;
  business_email?: string;
  pickup_address?: string;
  pickup_instructions?: string;
  pickup_hours?: string;
  business_hours?: string;
  preorder_deadline?: string;
  same_day_deadline?: string;
  announcement_banner_text?: string;
  is_stall_open?: boolean;
};

export const DEFAULTS: Required<SystemSettings> = {
  delivery_fee: 15,
  club_discount_threshold: 3,
  member_discount_percent: 10,
  bit_number: "",
  paybox_number: "",
  whatsapp_number: "972500000000",
  business_phone: "05-32455705",
  contact_phone: "05-32455705",
  business_email: "flowerssheshe@gmail.com",
  pickup_address: "רחוב צין 37,ירוחם(ליד סופר פינתי)",
  pickup_instructions: "",
  pickup_hours: "10:00-15:00",
  business_hours: "ראשון-חמישי 08:00-18:00, שישי 09:00-14:00",
  preorder_deadline: "10:00",
  same_day_deadline: "13:00",
  announcement_banner_text: "",
  is_stall_open: false,
};