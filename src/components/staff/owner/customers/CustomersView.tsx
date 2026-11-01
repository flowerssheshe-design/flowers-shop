"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Search, Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import { StaffPageHeader } from "@/components/staff/StaffShell";
import type { CustomerListItem } from "@/lib/staff/owner/customers";
import { EmptyState, ErrorState, LoadingState, fmtDate, useStaffJson } from "../shared";

export function CustomersView() {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);

  const url = `/api/staff/customers${debounced ? `?q=${encodeURIComponent(debounced)}` : ""}`;
  const { data, error, loading, reload } = useStaffJson<{ customers: CustomerListItem[] }>(url);
  const customers = data?.customers ?? [];

  return (
    <div>
      <StaffPageHeader title="לקוחות" description="כל הלקוחות הרשומים, ההזמנות שלהם וההנחה שהם מקבלים" />

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="חיפוש לפי שם, טלפון או אימייל"
          className="h-12 ps-9"
          aria-label="חיפוש לקוחות"
        />
      </div>

      {error && <ErrorState message={error} onRetry={() => void reload()} />}
      {loading && !data && <LoadingState />}
      {data && !error && customers.length === 0 && (
        <EmptyState title={debounced ? "לא נמצאו לקוחות" : "עוד אין לקוחות רשומים"} hint={debounced ? "נסו חיפוש אחר." : undefined} />
      )}

      {customers.length > 0 && (
        <>
          <p className="mb-2 text-sm text-muted-foreground">{customers.length} לקוחות</p>
          <ul className="divide-y rounded-xl border bg-card shadow-sm">
            {customers.map((c) => (
              <li key={c.id}>
                <Link href={`/staff/customers/${c.id}`} className="flex items-center gap-3 p-4 hover:bg-muted/50">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{c.full_name || c.email || "ללא שם"}</span>
                      {c.customer_status === "returning" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                          <Star className="h-3 w-3" />
                          לקוח קבוע
                        </span>
                      )}
                      {c.effective_discount > 0 && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">{c.effective_discount}% הנחה</span>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <span dir="ltr">{c.phone || "—"}</span>
                      {c.source && <> · הגיע דרך {c.source}</>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {c.orders_count} הזמנות · {c.completed_count} הושלמו · הזמנה אחרונה {fmtDate(c.last_order_at, true)}
                    </div>
                  </div>
                  <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
