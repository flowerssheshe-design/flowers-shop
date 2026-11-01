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
  /** 0=Sunday … 6=Saturday. The weekly order to the supplier. */
  supplier_order_day?: number;
  supplier_order_time?: string;
  /** When the business week closes and the next one opens. */
  week_close_day?: number;
  week_close_time?: string;
  stall_bit_number?: string;
  stall_bit_qr_url?: string;
  stall_hours?: string;
  /** "YYYY-MM-DD": the money, expenses and pay pages count only from this date. "" = from the start. */
  money_start_date?: string;
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
  supplier_order_day: 2,
  supplier_order_time: "12:00",
  week_close_day: 6,
  week_close_time: "21:00",
  stall_bit_number: "",
  stall_bit_qr_url: "",
  stall_hours: "שישי 08:00-14:00",
  money_start_date: "",
};