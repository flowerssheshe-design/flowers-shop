import {
  CLUB_DISCOUNT_THRESHOLD,
  MEMBER_DISCOUNT_PERCENT,
} from "@/lib/constants";

export { CLUB_DISCOUNT_THRESHOLD, MEMBER_DISCOUNT_PERCENT };

export type Product = {
  id: string;
  title: string;
  description: string | null;
  price_standard: number;
  price_member: number;
  image_url: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type CartItem = {
  productId: string;
  title: string;
  qty: number;
  price: number;
  image_url?: string | null;
};

export type DeliveryType = "pickup" | "delivery";

export type CreateOrderInput = {
  customer_name: string;
  customer_phone: string;
  delivery_address?: string | null;
  items: CartItem[];
  total_amount: number;
  delivery_type: DeliveryType;
  delivery_fee: number;
  is_member: boolean;
  notes?: string | null;
};

export type Order = {
  id: string;
  customer_name: string;
  customer_phone: string;
  delivery_address: string | null;
  items: CartItem[];
  total_amount: number;
  delivery_type: DeliveryType;
  delivery_fee: number;
  is_member: boolean;
  notes: string | null;
  status: "pending" | "confirmed" | "completed" | "cancelled" | "archived";
  user_id: string | null;
  created_at: string;
};

export type SupplierAggregate = {
  product_id: string;
  title: string;
  total_qty: number;
};

export type Profile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  address: string | null;
  notification_opt_in: boolean;
  created_at: string;
  updated_at: string;
};

export type SessionUser = {
  id: string;
  email: string | null;
  fullName: string;
  phone: string | null;
  address: string | null;
  notification_opt_in: boolean;
};

export type AdminUser = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  address: string | null;
  notification_opt_in: boolean | null;
  created_at: string | null;
  order_count: number;
  completed_count: number;
};

export type WeeklyKpi = {
  total_revenue: number;
  delivery_revenue: number;
  products_revenue: number;
  orders_count: number;
  pickup_count: number;
  delivery_count: number;
  member_orders_count: number;
  new_customers_count: number;
  returning_customers_count: number;
  avg_order_value: number;
};

export type TopProduct = {
  product_id: string;
  title: string;
  units: number;
  revenue: number;
};

export type WeeklyArchive = {
  id: string;
  week_start: string;
  week_end: string;
  total_revenue: number;
  delivery_revenue: number;
  products_revenue: number;
  orders_count: number;
  pickup_count: number;
  delivery_count: number;
  member_orders_count: number;
  new_customers_count: number;
  returning_customers_count: number;
  top_products: TopProduct[];
  product_sales: TopProduct[];
  created_at: string;
};