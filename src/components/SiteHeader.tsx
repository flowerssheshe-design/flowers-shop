"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Menu, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { SessionUser } from "@/types";

type Props = {
  cartCount: number;
  onCartClick: () => void;
  user: SessionUser | null;
  hasSubmittedOrder?: boolean;
};

export function SiteHeader({ cartCount, onCartClick, user, hasSubmittedOrder }: Props) {
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    router.replace("/");
    router.refresh();
  }

  const storeHref = hasSubmittedOrder ? "/?reset=1" : "/#store";

  const navLinks = [
    { href: storeHref, label: "חנות" },
    { href: "/#about", label: "אודות" },
    { href: user ? "/profile" : "/login", label: "פרטי החשבון" },
  ];

  function closeMobileMenu() {
    setMobileMenuOpen(false);
  }

  function handleLogout() {
    closeMobileMenu();
    void logout();
  }

  return (
    <header className="sticky top-0 z-[60] border-b border-primary/10 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="container flex items-center justify-between overflow-x-hidden py-3 sm:py-4">
        {/* Logo / Brand */}
        <Link
          href="/"
          className="flex items-center justify-center gap-3 text-center"
          aria-label="לתת מהלב - פרחים בכל שישי"
        >
          <span className="leading-tight">
            <span className="brand-serif inline-flex items-baseline text-[2.5rem] font-extrabold tracking-tight text-primary sm:text-[3rem] md:text-[3.5rem]">
              לתת מהלב
              <span className="ms-3 text-sm font-semibold leading-tight text-foreground/80 sm:text-base md:text-lg">
                פרחים בכל שישי
              </span>
            </span>
          </span>
        </Link>

        {/* Desktop navigation */}
        <nav aria-label="ניווט ראשי" className="hidden md:flex">
          <ul className="flex items-center justify-center gap-1 sm:gap-2 md:gap-4">
            {navLinks.map((link) => (
              <NavItem
                key={link.href}
                href={link.href}
                label={link.label}
              />
            ))}
            {user ? (
              <li>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium text-foreground/80 transition hover:bg-accent hover:text-primary md:text-base"
                >
                  <LogOut className="h-4 w-4" />
                  התנתק
                </button>
              </li>
            ) : (
              <NavItem href="/login" label="התחברות / הרשמה" />
            )}
            <li>
              <Button
                type="button"
                variant="ghost"
                onClick={onCartClick}
                aria-label="פתח עגלה"
                className={cn(
                  "relative shrink-0 rounded-full px-3",
                  cartCount > 0
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "",
                )}
              >
                <ShoppingBag className="h-4 w-4" />
                <span className="hidden sm:inline">עגלה</span>
                {cartCount > 0 && (
                  <span className="absolute -end-2 -top-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-gold px-1.5 text-xs font-bold text-gold-foreground shadow">
                    {cartCount}
                  </span>
                )}
              </Button>
            </li>
          </ul>
        </nav>

        {/* Mobile controls */}
        <div className="flex items-center gap-2 md:hidden">
          <Button
            type="button"
            variant="ghost"
            size="default"
            aria-label="פתח עגלה"
            onClick={onCartClick}
            className={cn(
              "relative shrink-0 rounded-full px-3",
              cartCount > 0
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "",
            )}
          >
            <ShoppingBag className="h-4 w-4" />
            {cartCount > 0 && (
              <span className="absolute -end-2 -top-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-gold px-1.5 text-xs font-bold text-gold-foreground shadow">
                {cartCount}
              </span>
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="default"
            aria-label="תפריט"
            onClick={() => setMobileMenuOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Mobile drawer */}
      <Dialog open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>תפריט</DialogTitle>
          </DialogHeader>
          <nav aria-label="תפריט נייד" className="mt-2 flex flex-col gap-1">
            {navLinks.map((link) => (
              <MobileNavItem
                key={link.href}
                href={link.href}
                label={link.label}
                onClick={closeMobileMenu}
              />
            ))}
            {user ? (
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-2 rounded-full px-3 py-2 text-right text-sm font-medium text-foreground/80 transition hover:bg-accent hover:text-primary"
              >
                <LogOut className="h-4 w-4" />
                התנתק
              </button>
            ) : (
              <MobileNavItem
                href="/login"
                label="התחברות / הרשמה"
                onClick={closeMobileMenu}
              />
            )}
          </nav>
        </DialogContent>
      </Dialog>
    </header>
  );
}

function NavItem({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="rounded-full px-3 py-1.5 text-sm font-medium text-foreground/80 transition hover:bg-accent hover:text-primary md:text-base"
      >
        {label}
      </Link>
    </li>
  );
}

function MobileNavItem({
  href,
  label,
  onClick,
}: {
  href: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="block w-full rounded-full px-3 py-2 text-center text-sm font-medium text-foreground/80 transition hover:bg-accent hover:text-primary"
    >
      {label}
    </Link>
  );
}
