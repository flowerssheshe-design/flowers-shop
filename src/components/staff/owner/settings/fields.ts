// The settings page, grouped. Keys match system_settings / SettingsSchema.

export type FieldKind = "number" | "int" | "text" | "time" | "date" | "day" | "textarea" | "switch" | "url" | "email" | "phone";

export type Field = {
  key: string;
  label: string;
  kind: FieldKind;
  hint?: string;
  placeholder?: string;
  ltr?: boolean;
};

export type Group = { id: string; title: string; description?: string; fields: Field[] };

export const GROUPS: Group[] = [
  {
    id: "money",
    title: "כסף והנחות",
    fields: [
      { key: "delivery_fee", label: "דמי משלוח (₪)", kind: "number" },
      { key: "member_discount_percent", label: "הנחת לקוח קבוע (%)", kind: "number" },
      { key: "club_discount_threshold", label: "כמה הזמנות עד לקוח קבוע", kind: "int", hint: "אחרי כמה הזמנות שהושלמו הלקוח מקבל את ההנחה לבד." },
      {
        key: "money_start_date",
        label: "סופרים כסף מתאריך",
        kind: "date",
        hint: "דפי הכסף, ההוצאות והשכר סופרים רק מהתאריך הזה. ההזמנות וההנחות של הלקוחות לא משתנות. ריק = מההתחלה.",
      },
    ],
  },
  {
    id: "week",
    title: "שבוע והזמנה מהספק",
    description: "במועד ההזמנה מהספק האתר עובר לבד ממכירה מראש למכירה בלייב. בסגירת השבוע הנתונים נשמרים בארכיון ושבוע חדש מתחיל.",
    fields: [
      { key: "supplier_order_day", label: "יום ההזמנה מהספק", kind: "day" },
      { key: "supplier_order_time", label: "שעת ההזמנה מהספק", kind: "time" },
      { key: "week_close_day", label: "יום סגירת השבוע", kind: "day" },
      { key: "week_close_time", label: "שעת סגירת השבוע", kind: "time" },
      { key: "preorder_deadline", label: "שעה אחרונה להזמנה מראש (מוצג באתר)", kind: "time" },
      { key: "same_day_deadline", label: "שעה אחרונה להזמנה לאותו יום (מוצג באתר)", kind: "time" },
    ],
  },
  {
    id: "stalls",
    title: "דוכנים",
    fields: [
      { key: "stall_bit_number", label: "מספר ביט לתשלום בדוכן", kind: "phone", ltr: true },
      { key: "stall_bit_qr_url", label: "קישור לתמונת ברקוד ביט", kind: "url", ltr: true, hint: "כתובת של תמונה (https://…). מוצג ללקוח במסך הדוכן." },    ],
  },
  {
    id: "pickup",
    title: "איסוף ומשלוח",
    fields: [
      { key: "pickup_address", label: "כתובת לאיסוף עצמי", kind: "text" },
      { key: "pickup_hours", label: "שעות איסוף", kind: "text", placeholder: "10:00-15:00" },
      { key: "pickup_instructions", label: "הוראות איסוף", kind: "textarea" },
      { key: "business_hours", label: "שעות פעילות", kind: "text" },
    ],
  },
  {
    id: "contact",
    title: "פרטי קשר ותשלום",
    fields: [
      { key: "business_phone", label: "טלפון העסק", kind: "phone", ltr: true },
      { key: "contact_phone", label: "טלפון ליצירת קשר", kind: "phone", ltr: true },
      { key: "whatsapp_number", label: "מספר וואטסאפ", kind: "phone", ltr: true, hint: "בפורמט בינלאומי, למשל 972501234567" },
      { key: "business_email", label: "אימייל", kind: "email", ltr: true },
      { key: "bit_number", label: "מספר ביט (תשלום באתר)", kind: "phone", ltr: true },
      { key: "paybox_number", label: "מספר פייבוקס", kind: "phone", ltr: true },
    ],
  },
  {
    id: "banner",
    title: "באנר",
    fields: [
      { key: "announcement_banner_text", label: "הודעה בראש החנות", kind: "textarea", hint: "השאירו ריק כדי להסתיר את הבאנר." },
    ],
  },
];
