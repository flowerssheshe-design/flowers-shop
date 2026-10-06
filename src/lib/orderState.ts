import type { DeliveryType, PaymentMethod } from "@/types";

export const ORDER_STATE_KEY = "flowerswab_order_state";

export type OrderState = {
  qty: Record<string, number>;
  checkout: {
    name: string;
    phone: string;
    address: string;
    notes: string;
    deliveryType: DeliveryType;
    paymentMethod: PaymentMethod | "";
  };
  savedAt: number;
};

export function saveOrderState(state: Omit<OrderState, "savedAt">): void {
  try {
    sessionStorage.setItem(
      ORDER_STATE_KEY,
      JSON.stringify({ ...state, savedAt: Date.now() }),
    );
  } catch {
    // storage unavailable — silently ignore
  }
}

export function restoreOrderState(): OrderState | null {
  try {
    const raw = sessionStorage.getItem(ORDER_STATE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as OrderState;
  } catch {
    return null;
  }
}

export function clearOrderState(): void {
  try {
    sessionStorage.removeItem(ORDER_STATE_KEY);
  } catch {
    // ignore
  }
}
