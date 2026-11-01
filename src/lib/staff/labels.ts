// One place for the Hebrew wording used across the staff area, so every
// screen says the same thing the same way. Add terms here instead of
// writing new strings inline.

export const T = {
  // general
  save: "שמירה",
  saving: "שומר…",
  saved: "נשמר",
  cancel: "ביטול",
  delete: "מחיקה",
  edit: "עריכה",
  add: "הוספה",
  close: "סגירה",
  back: "חזרה",
  refresh: "רענון",
  loading: "טוען…",
  search: "חיפוש",
  confirm: "אישור",
  yes: "כן",
  no: "לא",
  none: "אין",
  total: "סה״כ",
  today: "היום",
  thisWeek: "השבוע",
  logout: "התנתקות",
  loadError: "הטעינה נכשלה. נסו לרענן.",
  saveError: "השמירה נכשלה. נסו שוב.",
  networkError: "אין חיבור לשרת. בדקו את האינטרנט ונסו שוב.",

  // entities
  order: "הזמנה",
  orders: "הזמנות",
  preorder: "הזמנה מראש",
  liveOrder: "הזמנה בלייב",
  stallSale: "מכירה בדוכן",
  manualOrder: "הזמנה ידנית",
  product: "זר",
  products: "זרים",
  stall: "דוכן",
  stalls: "דוכנים",
  shift: "משמרת",
  shifts: "משמרות",
  employee: "עובד",
  employees: "עובדים",
  customer: "לקוח",
  customers: "לקוחות",
  delivery: "משלוח",
  deliveries: "משלוחים",
  pickup: "איסוף עצמי",
  supplier: "ספק",
  supplierOrder: "הזמנה מהספק",
  stock: "מלאי",
  expense: "הוצאה",
  expenses: "הוצאות",
  payroll: "שכר",
  revenue: "הכנסות",
  profit: "רווח",
  netProfit: "רווח נקי",

  // payment
  cash: "מזומן",
  bit: "ביט",
  paybox: "פייבוקס",

  // order status
  status: {
    pending_payment: "ממתינה לתשלום",
    approved: "מאושרת",
    completed: "הושלמה",
    cancelled: "בוטלה",
    archived: "בארכיון",
  } as Record<string, string>,

  // week phase
  beforeSupplierOrder: "לפני ההזמנה מהספק",
  afterSupplierOrder: "מכירה בלייב",

  // pay
  payType: {
    hourly: "לפי שעה",
    per_shift: "לפי משמרת",
    per_delivery: "לפי משלוח",
  } as Record<string, string>,
} as const;

export const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
