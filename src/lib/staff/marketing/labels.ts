// Hebrew wording for the marketing area.

import type { SegmentKind } from "./segments";
import type { AutomationKind } from "./automations";

export const SEGMENT_LABELS: Record<SegmentKind, string> = {
  all: "כל הלקוחות שאישרו הודעות",
  ordered_recently: "הזמינו בשבועות האחרונים",
  never_ordered: "נרשמו ועוד לא הזמינו",
  regulars: "לקוחות קבועים",
  lapsed: "הזמינו בעבר ולא הזמינו לאחרונה",
};

export const SEGMENT_NEEDS_WEEKS: Record<SegmentKind, boolean> = {
  all: false,
  ordered_recently: true,
  never_ordered: false,
  regulars: false,
  lapsed: true,
};

export const AUTOMATION_LABELS: Record<AutomationKind, { title: string; description: string }> = {
  preorder_closing: {
    title: "תזכורת: ההזמנות נסגרות",
    description: "נשלחת פעם אחת בשבוע, כמה שעות לפני ההזמנה מהספק, ללקוחות שעוד לא הזמינו השבוע.",
  },
  order_thanks: {
    title: "תודה על ההזמנה",
    description: "נשלחת ללקוח מיד אחרי שהוא מזמין באתר.",
  },
  win_back: {
    title: "מזמן לא הזמנת",
    description: "נשלחת פעם אחת ללקוח שלא הזמין כמה שבועות.",
  },
};

export const ML = {
  whatsappNotConnectedTitle: "וואטסאפ עוד לא מחובר",
  whatsappNotConnectedSteps: [
    "חשבון Meta Business מאומת.",
    "מספר טלפון ייעודי לעסק, שלא משמש כבר באפליקציית וואטסאפ.",
    "אסימון גישה קבוע ומזהה המספר, שמוגדרים בשרת כ-WHATSAPP_API_TOKEN ו-WHATSAPP_PHONE_ID.",
    "תבניות שאושרו מראש ב-Meta לכל הודעה שיווקית. הודעה חופשית מותרת רק תוך 24 שעות מההודעה האחרונה של הלקוח.",
    "Meta גובה תשלום על כל הודעה שיווקית שנשלחת.",
  ],
  whatsappNotConnectedFoot: "עד אז אפשר להכין תבניות והודעות אוטומטיות, אבל שום הודעה לא תישלח.",
  whatsappNotConfiguredError: "וואטסאפ עוד לא מחובר, ולכן ההודעה לא נשלחה.",
  pushNotConfiguredTitle: "התראות לטלפון עוד לא מוגדרות",
  pushNotConfiguredSteps: [
    "בטרמינל בתיקיית הפרויקט מריצים: npx web-push generate-vapid-keys",
    "את המפתח הציבורי (Public Key) שמים ב-NEXT_PUBLIC_VAPID_PUBLIC_KEY.",
    "את המפתח הפרטי (Private Key) שמים ב-VAPID_PRIVATE_KEY. לא לשתף אותו עם אף אחד.",
    "ב-VAPID_SUBJECT שמים כתובת קשר, למשל mailto:flowerssheshe@gmail.com",
    "מוסיפים את שלושתם ל-.env.local ולהגדרות הסביבה בשרת (Netlify), ומפעילים מחדש.",
  ],
  pushNotConfiguredError: "התראות לטלפון עוד לא מוגדרות (חסרים מפתחות VAPID).",
};
