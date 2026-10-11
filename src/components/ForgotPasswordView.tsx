"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SiteHeader } from "@/components/SiteHeader";
import { createClient } from "@/lib/supabase/client";
import { SUPABASE_CONFIGURED } from "@/lib/constants";

export function ForgotPasswordView() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (!SUPABASE_CONFIGURED) {
        throw new Error("שרת האימות אינו מוגדר");
      }
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        {
          redirectTo: `${window.location.origin}/reset-password`,
        },
      );
      if (error) {
        throw error;
      }
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-background">
      <SiteHeader cartCount={0} onCartClick={() => undefined} user={null} />

      <section className="container max-w-md py-12 text-center">
        <h1 className="brand-serif text-3xl font-bold text-primary">
          איפוס סיסמה
        </h1>
        <div className="divider-gold mx-auto mt-2 h-px w-24" />
        <p className="mx-auto mt-3 max-w-sm text-sm text-muted-foreground">
          הזינו את הדואר האלקטרוני שלכם ונשלח לכם קישור לאיפוס הסיסמה.
        </p>

        {sent ? (
          <div className="mx-auto mt-6 max-w-sm rounded-lg border border-primary/20 bg-cream/60 p-4 text-sm font-medium text-foreground">
            קישור לאיפוס הסיסמה נשלח למייל שלך
          </div>
        ) : (
          <form
            onSubmit={submit}
            className="mx-auto mt-6 max-w-sm space-y-3 text-right"
          >
            <div className="space-y-1.5">
              <Label htmlFor="forgot-email">דואר אלקטרוני</Label>
              <Input
                id="forgot-email"
                type="email"
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
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
              disabled={submitting}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "שלח קישור לאיפוס"
              )}
            </Button>
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
