"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, ShoppingBag, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SessionUser } from "@/types";

type Props = {
  cartCount: number;
  onCartClick: () => void;
  user: SessionUser | null;
};

export function SiteHeader({ cartCount, onCartClick, user }: Props) {
  const router = useRouter();

  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-primary/10 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="container flex flex-col items-center gap-3 py-3 sm:py-4">
        <Link
          href="/"
          className="flex items-center justify-center gap-3 text-center"
          aria-label="לתת מהלב - פרחים בכל שישי"
        >
          {/* <span aria-hidden className="text-3xl sm:text-4xl">🌿</span> */}
          <span className="leading-tight">
            <span className="brand-serif inline-flex items-baseline text-[2.5rem] font-extrabold tracking-tight text-primary sm:text-[3rem] md:text-[3.5rem]">
              לתת מהלב
              <span className="ms-3 text-sm font-semibold leading-tight text-foreground/80 sm:text-base md:text-lg">
                פרחים בכל שישי
              </span>
            </span>
          </span>
          {/* <span aria-hidden className="text-3xl sm:text-4xl">🌸</span> */}
        </Link>

        {/* <div className="divider-gold h-px w-40 opacity-70" /> */}

        <nav
          aria-label="ניווט ראשי"
          className="flex w-full items-center justify-center gap-1 sm:gap-2 md:gap-4"
        >
          <ul className="flex items-center justify-center gap-1 sm:gap-2 md:gap-4">
            <NavItem href="/#store" label="חנות" />
            <NavItem href="/#about" label="אודות" />
            <NavItem
              href={user ? "/profile" : "/login"}
              label="פרטי החשבון"
            />
            {user ? (
              <li>
                <button
                  type="button"
                  onClick={logout}
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
                  cartCount > 0 ? "bg-primary text-primary-foreground hover:bg-primary/90" : ""
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

        <nav
          aria-label="ניווט נייד"
          className="-mx-1 flex w-full snap-x snap-mandatory gap-1 overflow-x-auto px-1 pb-1 sm:hidden"
        >
          <MobileItem href="/#store" label="חנות" />
          <MobileItem
            href={user ? "/profile" : "/login"}
            label="פרטי החשבון"
          />
          {user ? (
            <button
              type="button"
              onClick={logout}
              className="snap-start shrink-0 rounded-full border border-primary/15 bg-card px-3 py-1.5 text-xs font-medium text-foreground/80 transition hover:border-primary/30 hover:bg-accent hover:text-primary"
            >
              התנתק
            </button>
          ) : (
            <MobileItem href="/login" label="התחברות / הרשמה" />
          )}
          <button
            type="button"
            onClick={onCartClick}
            aria-label="פתח עגלה"
            className={cn(
              "snap-start shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition",
              cartCount > 0 ? "bg-primary text-primary-foreground hover:bg-primary/90" : ""
            )}
          >
            <ShoppingBag className="h-4 w-4" />
            {cartCount > 0 && (
              <span className="ms-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-bold text-gold-foreground">
                {cartCount}
              </span>
            )}
          </button>
        </nav>
      </div>
    </header>
  );
}

function NavItem({
  href,
  label,
  disabled,
}: {
  href: string;
  label: string;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <li>
        <span
          aria-disabled
          className="cursor-not-allowed rounded-md px-2 py-1.5 text-sm font-medium text-foreground/40 md:text-base"
        >
          {label}
        </span>
      </li>
    );
  }
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

function MobileItem({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="snap-start shrink-0 rounded-full border border-primary/15 bg-card px-3 py-1.5 text-xs font-medium text-foreground/80 transition hover:border-primary/30 hover:bg-accent hover:text-primary"
    >
      {label}
    </Link>
  );
}