import { describe, expect, it } from "vitest";
import { newOrderPushText } from "./new-order-text";

describe("newOrderPushText", () => {
  it("says who, what, pickup or delivery, and if it's not paid yet", () => {
    expect(newOrderPushText({ customerName: "נועה", items: [{ title: "חמניות", qty: 2 }], delivery: false, paid: true }, "דוכן 1")).toEqual({
      title: "הזמנה חדשה לדוכן 1",
      body: "נועה: חמניות ×2. איסוף מהדוכן. שימו בצד.",
    });
    expect(
      newOrderPushText({ customerName: "יוסי", items: [{ title: "וורד", qty: 1 }, { title: "זר", qty: 0 }], delivery: true, paid: false }, "דוכן 2").body,
    ).toBe("יוסי: וורד ×1. משלוח: השליח לוקח מהדוכן · עוד לא שולם. שימו בצד.");
  });
});
