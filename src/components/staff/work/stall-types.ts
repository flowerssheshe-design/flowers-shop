import type { SalesSummary } from "@/lib/staff/work/sales";

export type StallProduct = {
  id: string;
  title: string;
  image_url: string | null;
  price_standard: number;
  stock: number;
  initial_stock: number;
};

export type StallSale = {
  id: string;
  created_at: string;
  items: { productId: string; title: string; qty: number; price: number }[];
  total_amount: number;
  payment_method: "cash" | "bit" | null;
  status: string;
  sold_by: string | null;
};

export type Checklist = {
  kind: "open" | "close";
  checked_item_ids: string[];
  notes: string | null;
  created_at: string;
} | null;

export type PickupOrder = {
  id: string;
  created_at: string;
  customer_name: string;
  customer_phone: string;
  items: { title: string; qty: number }[];
  total_amount: number;
  payment_method: string | null;
  notes: string | null;
  greeting_note: string | null;
};

export type StallData = {
  today: string;
  canChooseStall: boolean;
  stalls: { id: string; name: string; location: string | null }[];
  bit: { number: string; qr_url: string };
  stall: { id: string; name: string; location: string | null; is_open: boolean } | null;
  products?: StallProduct[];
  sales?: StallSale[];
  summary?: SalesSummary;
  writeoffs?: { id: string; product_id: string; title: string; qty: number; reason: string; created_at: string }[];
  equipment?: { id: string; name: string }[];
  checklists?: { open: Checklist; close: Checklist };
  pickupOrders?: PickupOrder[];
};
