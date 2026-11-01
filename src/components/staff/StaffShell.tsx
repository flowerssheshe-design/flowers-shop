"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  HandCoins,
  Bell,
  Bike,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  Flower2,
  LayoutDashboard,
  Link as LinkIcon,
  LogOut,
  Menu,
  MessageCircle,
  Package,
  PackageOpen,
  Receipt,
  RefreshCw,
  Settings,
  ShoppingBasket,
  Store,
  TrendingUp,
  Truck,
  UserCog,
  UserRound,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  GROUP_ICONS,
  GROUP_LABELS,
  GROUP_ORDER,
  ROLE_LABELS,
  allowedSections,
  menuSections,
  type Section,
  type SectionGroup,
  type StaffRole,
} from "@/lib/staff/access";
import { T } from "@/lib/staff/labels";
import { requestStaffRefresh } from "@/lib/staff/refresh";

const ICONS: Record<string, LucideIcon> = {
  BarChart3,
  HandCoins,
  Bell,
  Bike,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  Flower2,
  LayoutDashboard,
  Link: LinkIcon,
  MessageCircle,
  Package,
  PackageOpen,
  Receipt,
  Settings,
  ShoppingBasket,
  Store,
  TrendingUp,
  Truck,
  UserCog,
  UserRound,
  Users,
  Wallet,
};


export type ShellEmployee = {
  id: string;
  full_name: string;
  role: StaffRole;
  roles?: string[];
  work_types: string[];
};

function isActive(pathname: string, href: string) {
  if (href === "/staff") return pathname === "/staff";
  return pathname === href || pathname.startsWith(href + "/");
}

const OPEN_TOPICS_KEY = "staff.nav.open";

function readOpenTopics(): SectionGroup[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(OPEN_TOPICS_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((g): g is SectionGroup => GROUP_ORDER.includes(g)) : [];
  } catch {
    return [];
  }
}

function NavLink({
  section,
  active,
  nested,
  onNavigate,
}: {
  section: Section;
  active: boolean;
  nested?: boolean;
  onNavigate?: () => void;
}) {
  const Icon = ICONS[section.icon] ?? LayoutDashboard;
  return (
    <Link
      href={section.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-11 items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition lg:min-h-9",
        nested && "ps-9",
        active ? "bg-primary text-primary-foreground" : "text-foreground/80 hover:bg-accent hover:text-primary",
      )}
    >
      {!nested && <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
      {section.label}
    </Link>
  );
}

/**
 * The menu as a table of contents: one heading per topic (stalls, orders,
 * team…) that opens to its pages. A topic with a single page is a plain link.
 */
function NavList({
  sections,
  pathname,
  onNavigate,
}: {
  sections: Section[];
  pathname: string;
  onNavigate?: () => void;
}) {
  // A sub-page (e.g. /staff/marketing/links) must not also light up its parent.
  const active = sections
    .filter((s) => isActive(pathname, s.href))
    .sort((a, b) => b.href.length - a.href.length)[0];

  const [open, setOpen] = useState<SectionGroup[]>([]);

  // Remember which topics were open, and always open the current page's topic.
  useEffect(() => {
    setOpen((cur) => {
      const base = cur.length ? cur : readOpenTopics();
      return active && !base.includes(active.group) ? [...base, active.group] : base;
    });
  }, [active]);

  function toggle(group: SectionGroup) {
    setOpen((cur) => {
      const next = cur.includes(group) ? cur.filter((g) => g !== group) : [...cur, group];
      try {
        window.localStorage.setItem(OPEN_TOPICS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return (
    <nav className="space-y-1" aria-label="תפריט">
      {GROUP_ORDER.map((group) => {
        const items = sections.filter((s) => s.group === group);
        if (items.length === 0) return null;
        if (items.length === 1) {
          return (
            <NavLink key={group} section={items[0]} active={items[0] === active} onNavigate={onNavigate} />
          );
        }
        const isOpen = open.includes(group);
        const hasActive = items.some((s) => s === active);
        const TopicIcon = ICONS[GROUP_ICONS[group]] ?? LayoutDashboard;
        const panelId = `nav-topic-${group}`;
        return (
          <div key={group}>
            <button
              type="button"
              onClick={() => toggle(group)}
              aria-expanded={isOpen}
              aria-controls={panelId}
              className={cn(
                "flex min-h-11 w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-semibold transition hover:bg-accent lg:min-h-9",
                hasActive && !isOpen ? "text-primary" : "text-foreground",
              )}
            >
              <TopicIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="flex-1 text-start">{GROUP_LABELS[group]}</span>
              <ChevronDown
                className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")}
                aria-hidden="true"
              />
            </button>
            {isOpen && (
              <div id={panelId} className="mt-0.5 space-y-0.5">
                {items.map((s) => (
                  <NavLink key={s.key} section={s} active={s === active} nested onNavigate={onNavigate} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

export function StaffShell({
  employee,
  children,
}: {
  employee: ShellEmployee;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const sections = menuSections(employee);
  // The page title in the phone header also covers pages not listed in the menu ("my area").
  const current = allowedSections(employee)
    .filter((s) => isActive(pathname, s.href))
    .sort((a, b) => b.href.length - a.href.length)[0];

  async function logout() {
    await fetch("/api/staff/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "staff" }),
    }).catch(() => {});
    router.replace("/staff/login");
    router.refresh();
  }

  const meActive = isActive(pathname, "/staff/me");
  const userBox = (
    <div className="flex items-center justify-between gap-2 border-t pt-4">
      {/* "My area" lives here, on the person's own name. */}
      <Link
        href="/staff/me"
        onClick={() => setMenuOpen(false)}
        aria-current={meActive ? "page" : undefined}
        className={cn(
          "flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 transition",
          meActive ? "bg-primary text-primary-foreground" : "hover:bg-accent",
        )}
      >
        <UserRound className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{employee.full_name}</span>
          <span className={cn("block truncate text-xs", meActive ? "text-primary-foreground/80" : "text-muted-foreground")}>
            האזור שלי · {ROLE_LABELS[employee.role]}
          </span>
        </span>
      </Link>
      <button
        type="button"
        onClick={logout}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
        {T.logout}
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Mobile header */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background px-4 lg:hidden">
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-md hover:bg-accent"
          aria-label="פתיחת תפריט"
        >
          <Menu className="h-5 w-5" />
        </button>
        <p className="truncate text-base font-semibold">{current?.label ?? "צוות"}</p>
        <span className="w-10" />
      </header>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="סגירת תפריט"
            onClick={() => setMenuOpen(false)}
          />
          <aside className="absolute inset-y-0 right-0 flex w-72 max-w-[85%] flex-col gap-4 overflow-y-auto bg-background p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <p className="text-base font-semibold">לתת מהלב · צוות</p>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent"
                aria-label="סגירת תפריט"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1">
              <NavList sections={sections} pathname={pathname} onNavigate={() => setMenuOpen(false)} />
            </div>
            {userBox}
          </aside>
        </div>
      )}

      <div className="lg:flex">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-4 overflow-y-auto border-l bg-background p-4 lg:flex">
          <p className="px-3 text-base font-semibold">לתת מהלב · צוות</p>
          <div className="flex-1">
            <NavList sections={sections} pathname={pathname} />
          </div>
          {userBox}
        </aside>

        <main className="min-w-0 flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

/** Standard page title row for staff pages. */
export function StaffPageHeader({
  title,
  description,
  actions,
  refresh = true,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  /** A "רענון" button that reloads all the data on the page (off for pages with their own). */
  refresh?: boolean;
}) {
  const [spinning, setSpinning] = useState(false);
  function onRefresh() {
    requestStaffRefresh();
    setSpinning(true);
    window.setTimeout(() => setSpinning(false), 800);
  }
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {(actions || refresh) && (
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          {refresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex h-11 items-center gap-1.5 rounded-md border bg-background px-3 text-sm font-medium hover:bg-accent md:h-10"
            >
              <RefreshCw className={cn("h-4 w-4", spinning && "animate-spin")} aria-hidden="true" />
              {T.refresh}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
