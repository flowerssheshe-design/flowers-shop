// Hebrew wording for the owner screens. Shared terms live in
// src/lib/staff/labels.ts (T); only owner-specific strings are here.

export const OT = {
  dashboard: {
    title: "השבוע עכשיו",
    description: "מה קורה השבוע, בזמן אמת",
    phasePreorder: "לפני ההזמנה מהספק",
    phaseLive: "מכירה בלייב",
    untilSupplier: "עד ההזמנה מהספק",
    supplierSent: "ההזמנה נשלחה לספק",
    supplierNotSent: "ההזמנה לספק עוד לא נשלחה",
    openToday: "פתוח היום",
    nothingOpen: "אין דוכן פתוח היום",
    weekCloses: "השבוע נסגר",
    tabs: { products: "מוצרים", stalls: "דוכנים", team: "צוות", money: "כסף", supplier: "הזמנה לספק" },
  },
  kpi: {
    orders: "הזמנות",
    revenue: "הכנסות",
    website: "אתר",
    stalls: "דוכנים",
    expenses: "הוצאות כלליות",
    payroll: "שכר השבוע",
    costs: "עלויות השבוע",
    net: "רווח נקי השבוע",
    supplierCost: "עלות ספק",
  },
  money: {
    title: "כסף ושכר",
    description: "הכנסות, הוצאות, שכר ורווח נקי לפי שבוע",
    preorder: "הזמנות מראש",
    live: "הזמנות בלייב",
    manual: "הזמנות ידניות",
    oneTime: "הוצאות חד-פעמיות",
    recurring: "הוצאות קבועות",
    payroll: "שכר",
    gross: "רווח גולמי",
    basisOrder: "לפי ההזמנה שנשלחה לספק",
    basisSold: "לפי מה שנמכר (ההזמנה לספק עוד לא נשלחה)",
    current: "השבוע הנוכחי",
    closed: "שבוע סגור",
    openWeek: "עוד לא נסגר",
  },
  supplier: {
    title: "הזמנה מהספק",
    description: "כמה להזמין מכל זר, והמלאי שיישאר למכירה בלייב",
    preordered: "הוזמן מראש",
    extra: "תוספת",
    final: "להזמין",
    live: "לבלייב",
    send: "ההזמנה נשלחה לספק",
    sendConfirm: "לסמן שההזמנה נשלחה? המלאי לבלייב יתעדכן לפי הכמויות.",
    sentAt: "נשלחה",
    copy: "העתקת ההודעה",
    whatsapp: "שליחה בוואטסאפ",
    saveDefault: "שמירה כברירת מחדל",
  },
} as const;

export function phaseLabel(phase: "preorder" | "live"): string {
  return phase === "live" ? OT.dashboard.phaseLive : OT.dashboard.phasePreorder;
}
