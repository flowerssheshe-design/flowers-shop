"use client";

import { useRouter } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { LoginDialog } from "@/components/LoginDialog";
import { Sparkles } from "lucide-react";
import { useState, useRef } from "react";
import { CLUB_DISCOUNT_THRESHOLD } from "@/types";

export function LoginPageView() {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const loggedInRef = useRef(false);

  return (
    <main className="min-h-screen bg-background">
      <SiteHeader cartCount={0} onCartClick={() => undefined} user={null} />

      <section className="container max-w-xl py-12 text-center">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-medium text-gold-foreground">
          <Sparkles className="h-3.5 w-3.5" />
          התחברו לחשבון קיים או הרשמו כדי לעקוב אחר הזמנות
        </div>
        <h1 className="brand-serif text-3xl font-bold text-primary sm:text-4xl">
          התחברות / הרשמה
        </h1>
        <div className="divider-gold mx-auto mt-2 h-px w-24" />
        <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
          הרשמה אורכת כשנייה: אימייל וסיסמה. תקבלו גישה לפרטי החשבון, היסטוריית
          הזמנות, והנחת קונה קבוע אחרי {CLUB_DISCOUNT_THRESHOLD} הזמנות.
        </p>
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90"
          >
            פתח טופס התחברות
          </button>
        </div>
      </section>

      <LoginDialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v && !loggedInRef.current) {
            router.push("/");
          }
        }}
        onSuccess={() => {
          loggedInRef.current = true;
          window.location.href = "/profile";
        }}
      />
    </main>
  );
}