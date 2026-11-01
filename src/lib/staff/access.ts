// Who can open which part of the staff area. Shared by the nav (client),
// the staff layout and every /api/staff/* route, so keep it free of
// server-only imports.

export type StaffRole = "owner" | "ops_manager" | "marketing" | "worker";
export type WorkType = "stall_seller" | "courier" | "supply_runner";

export type StaffIdentity = {
  /** The primary responsibility (owner > ops_manager > marketing > worker). */
  role: StaffRole;
  /** Every responsibility the person has. Missing on old sessions: falls back to role. */
  roles?: string[];
  work_types: string[];
};

/** Responsibilities, highest first. "worker" means none. */
export const RESPONSIBILITIES: Exclude<StaffRole, "worker">[] = ["owner", "ops_manager", "marketing"];

/** Does this person hold the responsibility (as primary or as an extra one)? */
export function hasRole(w: StaffIdentity, role: Exclude<StaffRole, "worker">): boolean {
  return w.role === role || (w.roles ?? []).includes(role);
}

/** The primary role stored in employees.role, derived from all responsibilities. */
export function primaryRole(roles: string[]): StaffRole {
  return RESPONSIBILITIES.find((r) => roles.includes(r)) ?? "worker";
}

export type SectionKey =
  | "dashboard"
  | "orders"
  | "schedule"
  | "stalls"
  | "team"
  | "money"
  | "expenses"
  | "payroll"
  | "products"
  | "inventory"
  | "supplier"
  | "customers"
  | "settings"
  | "marketing"
  | "marketing_links"
  | "marketing_whatsapp"
  | "marketing_push"
  | "me"
  | "stall"
  | "deliveries"
  | "supply";

/** Menu topics. Each person only sees topics that have a section for them. */
export type SectionGroup =
  | "overview"
  | "stall"
  | "orders"
  | "team"
  | "money"
  | "products"
  | "marketing"
  | "settings";

export type Section = {
  key: SectionKey;
  href: string;
  label: string;
  group: SectionGroup;
  /** lucide-react icon name, resolved in the nav component. */
  icon: string;
  allow: (who: StaffIdentity) => boolean;
  /** Show it in the side menu (default: whenever allowed). */
  inMenu?: (who: StaffIdentity) => boolean;
};

const isOwner = (w: StaffIdentity) => hasRole(w, "owner");
const isOwnerOrOps = (w: StaffIdentity) => isOwner(w) || hasRole(w, "ops_manager");
const isOwnerOrMarketing = (w: StaffIdentity) => isOwner(w) || hasRole(w, "marketing");
// Work types are separate from responsibilities: a marketing lead can also sell at a stall.
const hasWork = (type: WorkType) => (w: StaffIdentity) => isOwnerOrOps(w) || w.work_types.includes(type);

export const GROUP_LABELS: Record<SectionGroup, string> = {
  overview: "סקירה",
  stall: "דוכנים ומכירה",
  orders: "הזמנות ומשלוחים",
  team: "צוות ומשמרות",
  money: "כסף",
  products: "זרים ומלאי",
  marketing: "לקוחות ושיווק",
  settings: "הגדרות",
};

/** lucide-react icon name per topic, resolved in the nav component. */
export const GROUP_ICONS: Record<SectionGroup, string> = {
  overview: "LayoutDashboard",
  stall: "Store",
  orders: "ClipboardList",
  team: "Users",
  money: "Wallet",
  products: "Flower2",
  marketing: "TrendingUp",
  settings: "Settings",
};

/** Topic order in the menu. */
export const GROUP_ORDER: SectionGroup[] = [
  "overview",
  "stall",
  "orders",
  "team",
  "money",
  "products",
  "marketing",
  "settings",
];

// Order inside each topic follows this list.
export const SECTIONS: Section[] = [
  { key: "dashboard", href: "/staff", label: "השבוע עכשיו", group: "overview", icon: "LayoutDashboard", allow: isOwner },

  { key: "stall", href: "/staff/stall", label: "מכירה בדוכן", group: "stall", icon: "ShoppingBasket", allow: hasWork("stall_seller") },
  { key: "stalls", href: "/staff/stalls", label: "ניהול דוכנים ושיבוץ", group: "stall", icon: "Store", allow: isOwnerOrOps },

  { key: "orders", href: "/staff/orders", label: "הזמנות לקוחות", group: "orders", icon: "ClipboardList", allow: isOwnerOrOps },
  { key: "deliveries", href: "/staff/deliveries", label: "משלוחים", group: "orders", icon: "Bike", allow: hasWork("courier") },
  { key: "supply", href: "/staff/supply", label: "איסוף מהספק", group: "orders", icon: "PackageOpen", allow: hasWork("supply_runner") },
  { key: "supplier", href: "/staff/supplier", label: "הזמנה מהספק", group: "orders", icon: "Truck", allow: isOwner },

  // Opened from the name at the bottom of the menu, not listed in it.
  { key: "me", href: "/staff/me", label: "האזור שלי", group: "team", icon: "UserRound", allow: () => true, inMenu: () => false },
  // The shift manager staffs Friday from "ניהול דוכנים"; the full weekly grid is for owners.
  { key: "schedule", href: "/staff/schedule", label: "לוח משמרות שבועי", group: "team", icon: "CalendarDays", allow: isOwnerOrOps, inMenu: isOwner },
  { key: "team", href: "/staff/team", label: "עובדים", group: "team", icon: "UserCog", allow: isOwnerOrOps },

  { key: "money", href: "/staff/money", label: "כסף", group: "money", icon: "Wallet", allow: isOwner },
  { key: "expenses", href: "/staff/expenses", label: "הוצאות", group: "money", icon: "Receipt", allow: isOwner },
  { key: "payroll", href: "/staff/payroll", label: "שכר", group: "money", icon: "HandCoins", allow: isOwner },

  { key: "products", href: "/staff/products", label: "זרים ומחירים", group: "products", icon: "Flower2", allow: isOwner },
  { key: "inventory", href: "/staff/inventory", label: "מלאי", group: "products", icon: "Package", allow: isOwnerOrOps },

  { key: "customers", href: "/staff/customers", label: "לקוחות", group: "marketing", icon: "Users", allow: isOwner },
  { key: "marketing", href: "/staff/marketing", label: "נתוני שיווק", group: "marketing", icon: "TrendingUp", allow: isOwnerOrMarketing },
  { key: "marketing_links", href: "/staff/marketing/links", label: "קישורי מעקב", group: "marketing", icon: "Link", allow: isOwnerOrMarketing },
  { key: "marketing_whatsapp", href: "/staff/marketing/whatsapp", label: "הודעות וואטסאפ", group: "marketing", icon: "MessageCircle", allow: isOwnerOrMarketing },
  { key: "marketing_push", href: "/staff/marketing/push", label: "התראות ובאנר", group: "marketing", icon: "Bell", allow: isOwnerOrMarketing },

  { key: "settings", href: "/staff/settings", label: "הגדרות", group: "settings", icon: "Settings", allow: isOwner },
];

export function getSection(key: SectionKey): Section {
  const s = SECTIONS.find((x) => x.key === key);
  if (!s) throw new Error(`Unknown staff section: ${key}`);
  return s;
}

export function canAccess(who: StaffIdentity, key: SectionKey): boolean {
  return getSection(key).allow(who);
}

export function allowedSections(who: StaffIdentity): Section[] {
  return SECTIONS.filter((s) => s.allow(who));
}

/** What the side menu lists for this person. */
export function menuSections(who: StaffIdentity): Section[] {
  return allowedSections(who).filter((s) => !s.inMenu || s.inMenu(who));
}

/** Where a staff member lands after login. */
export function homeHref(who: StaffIdentity): string {
  const preferred: Record<StaffRole, SectionKey[]> = {
    owner: ["dashboard"],
    ops_manager: ["orders", "schedule"],
    marketing: ["marketing"],
    // A worker lands on their own tool, then "my area".
    worker: ["stall", "deliveries", "supply", "me"],
  };
  const key = preferred[who.role]?.find((k) => canAccess(who, k));
  return key ? getSection(key).href : allowedSections(who)[0]?.href ?? "/staff/me";
}

/** Only owners change pay, prices, settings and other employees. */
export function canManageTeam(who: StaffIdentity): boolean {
  return hasRole(who, "owner");
}

export const ROLE_LABELS: Record<StaffRole, string> = {
  owner: "מנהל ראשי",
  ops_manager: "מנהל הזמנות ומשמרות",
  marketing: "אחראי שיווק",
  worker: "עובד",
};

export const WORK_TYPE_LABELS: Record<WorkType, string> = {
  stall_seller: "מוכר בדוכן",
  courier: "שליח",
  supply_runner: "איסוף מהספק",
};
