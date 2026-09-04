"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const items = [
  { href: "/admin/products", label: "מוצרים" },
  { href: "/admin/orders", label: "הזמנות" },
  { href: "/admin/users", label: "משתמשים" },
  { href: "/admin/messages", label: "הודעות וואצפ" },
  { href: "/admin/stats", label: "סטטיסטיקות" },
  { href: "/admin/history", label: "היסטוריה" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1">
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition",
              active
                ? "bg-primary text-primary-foreground shadow"
                : "text-foreground/70 hover:bg-accent hover:text-primary",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
