// Hebrew wording for the pay page (/staff/payroll).

import { formatILS } from "@/lib/utils";
import { T } from "@/lib/staff/labels";
import type { PayRate } from "@/lib/staff/pay-context";
import { HISTORY_SEED_WEEK } from "@/lib/staff/pay-context";
import { fmtDate } from "@/components/staff/owner/shared";

export const P = {
  title: "שכר",
  description: "כמה כל עובד מקבל, תשלומים חד-פעמיים, וכמה שילמתם לכל אחד.",
  tabRates: "קביעת שכר",
  tabEntries: "תשלומים חד-פעמיים",
  tabSummary: "סיכום תשלומים",
  fromThisWeek: "החל מהשבוע הזה. שבועות קודמים לא משתנים.",
  notReady: "טבלאות השכר החדשות עוד לא קיימות. צריך להריץ את מיגרציה 039, ועד אז השכר מחושב לפי הכרטיס של העובד.",
  budgetTitle: "תקציב שבועי למוכרים ולשליח",
  budgetHint:
    "על עבודה בדוכן ובמשלוחים לא קובעים תעריף. אתם קובעים סכום לשבוע, ומנהל המשמרות מחלק אותו בין המוכרים והשליח. מה שלא חולק עדיין נספר כהוצאה של השבוע.",
  budgetNotSet: "לא נקבע תקציב לשבוע הזה",
  budgetAllocated: "חולק עד עכשיו",
  budgetAmount: "תקציב לשבוע (₪)",
  budgetClosed: "השבוע הזה כבר נסגר, אי אפשר לשנות את התקציב.",
  setBudget: "שמירת תקציב",
  employeesTitle: "שכר לכל עובד",
  noEmployees: "אין עובדים פעילים שמקבלים שכר. מוסיפים עובדים בדף העובדים.",
  supplyRate: "איסוף מהספק",
  noRate: "אין תעריף",
  responsibility: "על האחריות",
  perWeek: "לשבוע",
  fromBudget: "דוכן ומשלוחים: מהתקציב השבועי",
  editPay: "שינוי שכר",
  history: "היסטוריית שכר",
  noHistory: "אין עדיין היסטוריה. השכר נקבע בפעם הראשונה כאן.",
  payTypeLabel: "תעריף לאיסוף מהספק",
  noRateOption: "בלי תעריף",
  rateLabel: "תעריף (₪)",
  respLabel: "שכר שבועי על האחריות (₪)",
  respHint: "סכום קבוע לכל שבוע, בנוסף לשכר על העבודה. השאירו ריק אם אין.",
  addEntry: "הוספת תשלום",
  entriesHint: "בונוס, תוספת או תשלום אחר לשבוע מסוים. נכנס לשכר של אותו שבוע.",
  noEntries: "אין תשלומים חד-פעמיים.",
  entryEmployee: "עובד",
  entryWeek: "שבוע",
  entryAmount: "סכום (₪)",
  entryDescription: "על מה",
  migrated: "הועבר מההוצאות",
  noEmployee: "בלי עובד",
  deleteEntry: "מחיקת תשלום",
  deleteEntryConfirm: "התשלום יימחק ולא ייספר יותר בשכר של השבוע.",
  grandTotal: "סה״כ שולם",
  grandTotalHint: "שבועות שנסגרו + השבוע עד היום + תשלומים חד-פעמיים",
  byWeek: "לפי שבוע (8 שבועות אחרונים)",
  byPerson: "לפי עובד",
  thisWeekSoFar: "השבוע (עד היום)",
  noPayYet: "עוד לא שולם שכר.",
  weeksCount: "שבועות",
  ofWhichEntries: "מתוכם חד-פעמי",
  budgetRemainder: "תקציב שלא חולק לעובדים",
};

export function rateText(r: Pick<PayRate, "pay_type" | "pay_rate">): string {
  if (!r.pay_type || r.pay_rate === null) return P.noRate;
  return `${T.payType[r.pay_type] ?? ""} · ${formatILS(r.pay_rate)}`;
}

export function sinceText(week: string | null): string {
  if (!week || week === HISTORY_SEED_WEEK) return "מההתחלה";
  return `משבוע ${fmtDate(week, true)}`;
}
