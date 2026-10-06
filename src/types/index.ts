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
  cost_price: number;
  image_url: string | null;
  image_urls: string[];
  is_active: boolean;
  is_available?: boolean;
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

export type FulfillmentType = "delivery" | "pickup";
export type PaymentMethod = "bit" | "paybox" | "cash";

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
  status: "pending_payment" | "approved" | "completed" | "cancelled" | "archived";
  user_id: string | null;
  created_at: string;
  fulfillment_type?: FulfillmentType;
  payment_method?: PaymentMethod;
  greeting_note?: string | null;
  updated_at?: string;
  inventory_deducted?: boolean;
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
  total_cost: number;
  gross_profit: number;
  orders_count: number;
  pickup_count: number;
  delivery_count: number;
  member_orders_count: number;
  new_customers_count: number;
  returning_customers_count: number;
  avg_order_value: number;
  cancelled_orders_count: number;
  cancelled_orders_value: number;
  visitors_count: number;
};

export type TopProduct = {
  product_id: string;
  title: string;
  units: number;
  revenue: number;
  cost: number;
  profit: number;
};

export type WeeklyArchive = {
  id: string;
  week_start: string;
  week_end: string;
  week_label: string;
  archived_at: string;
  total_revenue: number;
  delivery_revenue: number;
  products_revenue: number;
  total_cost: number;
  gross_profit: number;
  orders_count: number;
  pickup_count: number;
  delivery_count: number;
  member_orders_count: number;
  new_customers_count: number;
  returning_customers_count: number;
  cancelled_orders_count: number;
  cancelled_orders_value: number;
  preorders_count: number;
  preorders_revenue: number;
  preorders_profit: number;
   stall_sales_count: number;
   stall_revenue: number;
   stall_profit: number;
   total_supplier_cost: number;
   total_expenses?: number;
   /** Portion of total_expenses coming from fixed/recurring costs. */
   recurring_expenses?: number;
   /** Portion of total_expenses coming from one-time costs. */
   one_time_expenses?: number;
   total_net_profit: number;
  top_products: TopProduct[];
  product_sales: TopProduct[];
  snapshot_data: Record<string, unknown>;
  created_at: string;
};

export type Inventory = {
  id: string;
  product_id: string;
  live_stock_count: number;
  initial_stock_count: number;
  reserved_orders: number;
  updated_at: string;
};

export type Expense = {
  id: string;
  description: string;
  amount: number;
  category: string;
  expense_type: 'one_time' | 'recurring';
  /** Date the one-time expense applies to (YYYY-MM-DD). */
  expense_date?: string | null;
  /** When the row was created - start point for recurring expenses. */
  creation_date?: string | null;
  /** Deactivated recurring expenses stop applying to future weeks. */
  is_active?: boolean | null;
  created_at: string;
  updated_at?: string | null;
};

export type ExpensesSummary = {
  total_one_time: number;
  total_recurring: number;
  total_all: number;
};

export type AllTimeMetrics = {
  cumulative_gross_profit: number;
  total_expenses: number;
  true_net_profit: number;
  /** Portion of total_expenses from fixed costs, replicated per week. */
  recurring_expenses: number;
  /** Portion of total_expenses from one-time costs. */
  one_time_expenses: number;
};

/** Expenses charged to the currently displayed week. */
export type WeekExpenseMetrics = {
  /** Fixed costs applied to this week and onward from their start date. */
  recurring: number;
  /** One-time costs that fall inside this week. */
  oneTime: number;
  /** recurring + oneTime. */
  total: number;
};

export type WoWGrowth = {
  curr_revenue: number;
  prev_revenue: number;
  revenue_wow_pct: number | null;
  curr_gross_profit: number;
  prev_gross_profit: number;
  profit_wow_pct: number | null;
  curr_orders_count: number;
  prev_orders_count: number;
  orders_wow_pct: number | null;
};

export type BestSeller = {
  product_id: string;
  title: string;
  total_units: number;
  total_revenue: number;
  total_profit: number;
};

export type SellThrough = {
  product_id: string;
  title: string;
  total_sold: number;
  initial_stock: number;
  sell_through_pct: number;
};

export type InvestmentEfficiency = {
  avg_weekly_investment: number;
  avg_weekly_net_profit: number;
  avg_return_ratio: number;
  cycle_count: number;
};

export type CustomerSegments = {
  regular_customers: number;
  loyal_customers: number;
};

export type StatsPayloadExtended = {
  weekStart: string;
  weekEnd: string;
  allTimeMetrics: AllTimeMetrics;
  weekExpenses: WeekExpenseMetrics;
  bestSellerPreorders: BestSeller | null;
  bestSellerStallSales: BestSeller | null;
  highestSellThrough: SellThrough | null;
  customerSegments: CustomerSegments;
};
