"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useStoreMode } from "@/context/StoreModeContext";
import { useToast } from "@/components/ui/toaster";
import { Store, Zap, Lock, Unlock } from "lucide-react";

const items = [
  { href: "/admin/products", label: "מוצרים" },
  { href: "/admin/inventory", label: "מלאי" },
  { href: "/admin/orders", label: "הזמנות" },
  { href: "/admin/users", label: "משתמשים" },
  { href: "/admin/messages", label: "הודעות וואצפ" },
  { href: "/admin/stats", label: "סטטיסטיקות" },
  { href: "/admin/expenses", label: "הוצאות" },
  { href: "/admin/settings", label: "הגדרות" },
];

export function AdminNav() {
  const pathname = usePathname();
  const { mode, setMode, isLoading, isStallOpen, setStallOpen } = useStoreMode();
  const { toast } = useToast();

  async function handleModeChange(newMode: "preorder" | "realtime") {
    const previousMode = mode;
    try {
      await setMode(newMode);
      toast({
        title: newMode === "preorder" ? "מצב הועבר להזמנה מראש" : "מצב הועבר למכירה חיה בדוכן",
        variant: "success",
      });
    } catch (e) {
      console.error("[AdminNav] handleModeChange error:", e);
      toast({ title: "עדכון מצב חנות נכשל", variant: "error" });
    }
  }

  async function handleStallOpenChange() {
    const newStatus = !isStallOpen;
    try {
      await setStallOpen(newStatus);
      toast({
        title: newStatus ? "הדוכן נפתח" : "הדוכן נסגר",
        variant: "success",
      });
    } catch (e) {
      console.error("[AdminNav] handleStallOpenChange error:", e);
      toast({ title: "עדכון סטטוס דוכן נכשל", variant: "error" });
    }
  }

  return (
    <nav className="-mx-1 overflow-x-auto whitespace-nowrap px-1">
      <div className="inline-flex items-center gap-2">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "inline-flex rounded-md px-3 py-1.5 text-sm font-medium transition",
                active
                  ? "bg-primary text-primary-foreground shadow"
                  : "text-foreground/70 hover:bg-accent hover:text-primary",
              )}
            >
              {item.label}
            </Link>
          );
        })}

        <div className="inline-flex items-center gap-1.5 ml-2 border-r border-transparent pr-2">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider hidden sm:inline">מצב חנות</span>
          <div className="inline-flex items-center gap-0.5 rounded-md bg-muted/60 p-0.5" role="group" aria-label="מצב חנות">
            <button
              type="button"
              onClick={() => !isLoading && handleModeChange("preorder")}
              disabled={isLoading}
              className={cn(
                "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-all",
                mode === "preorder"
                  ? "bg-background text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              aria-pressed={mode === "preorder"}
            >
              <Store className="h-3 w-3" aria-hidden="true" />
              <span className="hidden sm:inline">הזמנה מראש</span>
            </button>
            <button
              type="button"
              onClick={() => !isLoading && handleModeChange("realtime")}
              disabled={isLoading}
              className={cn(
                "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-all",
                mode === "realtime"
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              aria-pressed={mode === "realtime"}
            >
              <Zap className="h-3 w-3" aria-hidden="true" />
              <span className="hidden sm:inline">מכירה חיה</span>
            </button>
          </div>
        </div>

        <div className="inline-flex items-center gap-1.5 ml-2 border-r border-transparent pr-2">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider hidden sm:inline">סטטוס דוכן</span>
          <div className="inline-flex items-center gap-0.5 rounded-md bg-muted/60 p-0.5" role="group" aria-label="סטטוס דוכן">
            <button
              type="button"
              onClick={handleStallOpenChange}
              disabled={isLoading}
              className={cn(
                "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-all",
                isStallOpen
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 shadow-sm"
                  : "bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive hover:bg-destructive/20"
              )}
              aria-pressed={isStallOpen}
            >
              {isStallOpen ? <Unlock className="h-3 w-3" aria-hidden="true" /> : <Lock className="h-3 w-3" aria-hidden="true" />}
              <span className="hidden sm:inline">{isStallOpen ? "דוכן פתוח" : "דוכן סגור"}</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
