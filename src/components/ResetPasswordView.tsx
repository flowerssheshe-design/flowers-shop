"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SiteHeader } from "@/components/SiteHeader";
import { createClient } from "@/lib/supabase/client";
import { SUPABASE_CONFIGURED } from "@/lib/constants";

const LINK_CHECK_DELAY_MS = 2000;
const REDIRECT_DELAY_MS = 1500;

export function ResetPasswordView() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [linkChecked, setLinkChecked] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled && session) {
        setSessionReady(true);
      }
    });

    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled && session) {
        setSessionReady(true);
      }
    });

    const timer = setTimeout(() => {
      if (!cancelled) {
        setLinkChecked(true);
      }
    }, LINK_CHECK_DELAY_MS);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (!SUPABASE_CONFIGURED) {
        throw new Error("שרת האימות אינו מוגדר");
      }
      if (password.length < 6) {
        throw new Error("הסיסמה חייבת להכיל לפחות 6 תווים");
      }
      if (password !== confirm) {
        throw new Error("הסיסמאות אינן תואמות");
      }
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        throw error;
      }
      setSuccess(true);
      setTimeout(() => {
        router.replace("/login");
      }, REDIRECT_DELAY_MS);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setSubmitting(false);
    }
  }

  const linkInvalid = linkChecked && !sessionReady;

  return (
    <main className="min-h-screen bg-background">
      <SiteHeader cartCount={0} onCartClick={() => undefined} user={null} />

      <section className="container max-w-md py-12 text-center">
        <h1 className="brand-serif text-3xl font-bold text-primary">
          הגדרת סיסמה חדשה
        </h1>
        <div className="divider-gold mx-auto mt-2 h-px w-24" />
        <p className="mx-auto mt-3 max-w-sm text-sm text-muted-foreground">
          הזינו סיסמה חדשה עבור החשבון שלכם.
        </p>

        {success ? (
          <div className="mx-auto mt-6 max-w-sm rounded-lg border border-primary/20 bg-cream/60 p-4 text-sm font-medium text-foreground">
            הסיסמה שונתה בהצלחה! מפנים אתכם לדף ההתחברות…
          </div>
        ) : linkInvalid ? (
          <div className="mx-auto mt-6 max-w-sm space-y-3">
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              הקישור פג תוקפו או אינו תקין.
            </p>
            <Link
              href="/forgot-password"
              className="inline-block text-sm font-medium text-primary hover:underline"
            >
              בקשו קישור חדש לאיפוס סיסמה
            </Link>
          </div>
        ) : (
          <form
            onSubmit={submit}
            className="mx-auto mt-6 max-w-sm space-y-3 text-right"
          >
            <div className="space-y-1.5">
              <Label htmlFor="new-password">סיסמה חדשה</Label>
              <Input
                id="new-password"
                type="password"
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="לפחות 6 תווים"
                autoComplete="new-password"
                minLength={6}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">אימות סיסמה חדשה</Label>
              <Input
                id="confirm-password"
                type="password"
                dir="ltr"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="חזרו על הסיסמה החדשה"
                autoComplete="new-password"
                minLength={6}
                required
              />
            </div>

            {error && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <Button
              type="submit"
              size="lg"
              className="w-full rounded-full"
              disabled={submitting || !sessionReady}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "עדכנו סיסמה"
              )}
            </Button>

            {!sessionReady && !linkChecked && (
              <p className="text-xs text-muted-foreground">
                מאמתים את קישור האיפוס…
              </p>
            )}
          </form>
        )}

        <p className="mt-6 text-sm text-muted-foreground">
          <Link href="/login" className="font-medium text-primary hover:underline">
            חזרו לדף ההתחברות
          </Link>
        </p>
      </section>
    </main>
  );
}
