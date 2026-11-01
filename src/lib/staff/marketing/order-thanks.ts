import "server-only";

// Call site (owner's /api/orders, after the order row is saved):
//   void sendOrderThanks(orderData.id);
// It never throws and sends at most once per order.
export { sendOrderThanks, type OrderThanksResult } from "./runner";
