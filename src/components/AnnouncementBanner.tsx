"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useSystemSettings } from "@/lib/useSystemSettings";

const CUSTOMER_ROUTES = ["/", "/storefront", "/catalog", "/cart", "/checkout"];

function isCustomerRoute(pathname: string): boolean {
  return CUSTOMER_ROUTES.some((route) => pathname === route || pathname.startsWith(route + "/"));
}

export function AnnouncementBanner() {
  const pathname = usePathname();
  const settings = useSystemSettings();
  const text = settings.announcement_banner_text?.trim() ?? "";
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!text) {
      setVisible(false);
      return;
    }
    if (!isCustomerRoute(pathname)) {
      setVisible(false);
      return;
    }
    // Banner always reappears on every page refresh; dismissal is
    // in-session only and never persisted to storage.
    setVisible(true);
  }, [text, pathname]);

  if (!mounted || !text) return null;
  if (!visible) return null;

  function handleClose() {
    setVisible(false);
  }

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-50 bg-[#5c6846] text-white"
      role="banner"
      aria-live="polite"
    >
      <div className="container relative flex flex-col items-center py-6 px-6 text-center">
        <p className="text-lg sm:text-xl font-bold text-center">
          {text}
        </p>
        <button
          type="button"
          onClick={handleClose}
          aria-label="סגור"
          className="absolute top-3 right-4 flex items-center justify-center rounded-full p-1.5 text-white/80 transition-colors hover:text-white hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#5c6846] min-w-10 min-h-10"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}