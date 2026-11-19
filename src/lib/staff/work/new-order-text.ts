// The words of the "new order" notification to the stall (pure, tested).

export type NewOrderInfo = {
  customerName: string;
  items: { title: string; qty: number }[];
  delivery: boolean;
  paid: boolean;
};

export function newOrderPushText(o: NewOrderInfo, stallName: string): { title: string; body: string } {
  const what = o.items
    .filter((i) => i.qty > 0)
    .map((i) => `${i.title} ×${i.qty}`)
    .join(", ");
  const how = o.delivery ? "משלוח: השליח לוקח מהדוכן" : "איסוף מהדוכן";
  return {
    title: `הזמנה חדשה ל${stallName}`,
    body: `${o.customerName}: ${what}. ${how}${o.paid ? "" : " · עוד לא שולם"}. שימו בצד.`,
  };
}
