import type { SupplierAggregate } from "@/types";

export interface SupplierMessageData {
  aggregates: SupplierAggregate[];
  weekStart: string;
  weekEnd: string;
}

function getWeekStart(date: Date = new Date()): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getDeliveryTargetDate(weekStart: Date): Date {
  const friday = new Date(weekStart);
  friday.setDate(weekStart.getDate() + 5);
  return friday;
}

export function getWeekBoundaries(): { weekStart: string; weekEnd: string } {
  const start = getWeekStart();
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return {
    weekStart: start.toISOString(),
    weekEnd: end.toISOString(),
  };
}

function formatDateHebrew(date: Date): string {
  return date.toLocaleDateString("he-IL", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateShort(date: Date): string {
  return date.toLocaleDateString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function buildSupplierMessage(data: SupplierMessageData): string {
  const { aggregates, weekStart, weekEnd } = data;
  const start = new Date(weekStart);
  const end = new Date(weekEnd);
  const deliveryTarget = getDeliveryTargetDate(getWeekStart(start));

  const totalQty = aggregates.reduce((sum, a) => sum + a.total_qty, 0);
  const totalTypes = aggregates.length;

  const lines: string[] = [];
  lines.push("הודעה לספק – הזמנה שבועית");
  lines.push("");
  lines.push(
    `בהזדמנות זו אנו מזמינים פרחים לשבוע קודש (${formatDateShort(start)} – ${formatDateShort(end)}).`,
  );
  lines.push("");

  if (totalTypes === 0) {
    lines.push("אין הזמנות פעילות לשבוע זה. ללא אספקה נדרשת.");
  } else {
    lines.push("אנא מספקים את המוצרים הבאים:");
    lines.push("");
    for (const a of aggregates) {
      lines.push(`• ${a.total_qty} × ${a.title}`);
    }
    lines.push("");
    lines.push(`סה״כ יחידות: ${totalQty}`);
    lines.push(`סוגי מוצרים: ${totalTypes}`);
  }

  lines.push("");
  lines.push(`תאריך אספקה יעד: ${formatDateHebrew(deliveryTarget)}`);
  lines.push("");
  lines.push("תודה רבה על השיתוף! 🌷");
  lines.push("");
  lines.push("— קבוצת פרחים לכבוד שבת קודש");

  return lines.join("\n");
}

export function buildSupplierTextFile(data: SupplierMessageData): string {
  const { aggregates, weekStart, weekEnd } = data;
  const start = new Date(weekStart);
  const end = new Date(weekEnd);

  const totalQty = aggregates.reduce((sum, a) => sum + a.total_qty, 0);

  const lines: string[] = [];
  lines.push("רשימת הזמנה לספק – שבוע שבין");
  lines.push(`תקופה: ${formatDateShort(start)} עד ${formatDateShort(end)}`);
  lines.push("");
  lines.push("פירוט:");
  lines.push("");

  if (aggregates.length === 0) {
    lines.push("אין הזמנות לשבוע זה.");
  } else {
    for (const a of aggregates) {
      lines.push(`${a.total_qty} × ${a.title}`);
    }
    lines.push("");
    lines.push(`סה״כ יחידות: ${totalQty}`);
  }

  lines.push("");
  lines.push(
    `תאריך אספקה יעד: ${formatDateHebrew(getDeliveryTargetDate(getWeekStart(start)))}`,
  );

  return lines.join("\n");
}
