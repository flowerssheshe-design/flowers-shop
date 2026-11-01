// Shapes exchanged between the operations APIs (/api/staff/{team,stalls,
// schedule,orders,inventory}) and their screens. No server-only imports.

import type { StaffRole, WorkType } from "@/lib/staff/access";
import type { PayType } from "@/lib/staff/payroll";

export type ShiftType = "stall" | "courier" | "supply";
export type OrderType = "preorder" | "live" | "stall" | "manual";
export type OrderStatus = "pending_payment" | "approved" | "completed" | "cancelled" | "archived";

/** What every owner / ops manager may see about an employee. */
export type TeamMember = {
  id: string;
  full_name: string;
  phone: string;
  /** Primary responsibility. */
  role: StaffRole;
  /** All responsibilities (owner / ops_manager / marketing); empty = regular worker. */
  roles: Exclude<StaffRole, "worker">[];
  work_types: WorkType[];
  is_active: boolean;
};

/** Extra fields only owners receive. */
export type TeamMemberOwnerView = TeamMember & {
  pay_type: PayType | null;
  pay_rate: number | null;
  /** Fixed pay per business week for the ops_manager / marketing responsibility. */
  responsibility_pay: number | null;
  failed_pin_attempts: number;
  locked_until: string | null;
  last_login_at: string | null;
};

export type Stall = {
  id: string;
  name: string;
  location: string | null;
  is_active: boolean;
  is_open: boolean;
  sort_order: number;
};

export type StallStockLine = {
  product_id: string;
  title: string;
  stock: number;
  initial_stock: number;
};

export type StallWithToday = Stall & {
  stock: StallStockLine[];
  scheduled: { employee_id: string; full_name: string; start_time: string; end_time: string }[];
};

export type EquipmentItem = {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
};

export type Shift = {
  id: string;
  work_date: string;
  start_time: string; // "HH:MM"
  end_time: string;
  shift_type: ShiftType;
  stall_id: string | null;
  employee_id: string;
  notes: string | null;
};

export type ScheduleData = {
  weekStart: string;
  weekEnd: string;
  isCurrentWeek: boolean;
  shifts: Shift[];
  employees: TeamMember[];
  stalls: Stall[];
  courierId: string | null;
};

export type OrderItem = {
  productId: string;
  title: string;
  qty: number;
  price: number;
};

export type StaffOrder = {
  id: string;
  created_at: string;
  status: OrderStatus;
  order_type: OrderType;
  customer_name: string;
  customer_phone: string;
  delivery_address: string | null;
  delivery_type: "pickup" | "delivery";
  fulfillment_type: "pickup" | "delivery" | null;
  delivery_fee: number;
  total_amount: number;
  items: OrderItem[];
  notes: string | null;
  greeting_note: string | null;
  payment_method: "bit" | "paybox" | "cash" | null;
  is_member: boolean;
  stall_id: string | null;
  approved_by: string | null;
  approved_by_name: string | null;
  inventory_deducted: boolean;
};

export type OrdersSummary = {
  total: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  delivery: number;
  pickup: number;
};

export type InventoryRow = {
  product_id: string;
  title: string;
  is_active: boolean;
  live_stock_count: number;
  initial_stock_count: number;
  reserved: number;
  stalls: Record<string, number>; // stall_id -> stock
};
