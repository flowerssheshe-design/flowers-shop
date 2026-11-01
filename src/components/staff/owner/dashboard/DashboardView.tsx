"use client";

import { useEffect, useState } from "react";
import { Receipt, ShoppingBag, TrendingUp, Users, Wallet } from "lucide-react";
import { StaffPageHeader } from "@/components/staff/StaffShell";
import { formatILS } from "@/lib/utils";
import { OT } from "@/lib/staff/owner/labels";
import type { DashboardData } from "@/lib/staff/owner/week-math";
import { ErrorState, Kpi, LoadingState, RefreshButton, Tabs, useStaffJson } from "../shared";
import { WeekBar } from "./WeekBar";
import { MoneyTab, ProductsTab, StallsTab, SupplierTab, TeamTab } from "./DashboardTabs";

type Response = {
  dashboard: DashboardData;
  storeMode: { mode: string; setting: string };
  weekClose: { closed: string[]; errors: number };
};

type TabKey = "products" | "stalls" | "team" | "money" | "supplier";

const TABS: { key: TabKey; label: string }[] = [
  { key: "products", label: OT.dashboard.tabs.products },
  { key: "stalls", label: OT.dashboard.tabs.stalls },
  { key: "team", label: OT.dashboard.tabs.team },
  { key: "money", label: OT.dashboard.tabs.money },
  { key: "supplier", label: OT.dashboard.tabs.supplier },
];

export function DashboardView() {
  const { data, error, loading, reload } = useStaffJson<Response>("/api/staff/dashboard");
  const [tab, setTab] = useState<TabKey>("products");

  // Live screen: refresh every minute while the tab is visible.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void reload();
    }, 60_000);
    return () => clearInterval(id);
  }, [reload]);

  const d = data?.dashboard;
  const f = d?.finance;

  return (
    <div>
      <StaffPageHeader refresh={false}
        title={OT.dashboard.title}
        description={OT.dashboard.description}
        actions={<RefreshButton onClick={() => void reload()} loading={loading} />}
      />

      {error && !d && <ErrorState message={error} onRetry={() => void reload()} />}
      {!d && !error && <LoadingState />}

      {d && f && data && (
        <>
          {data.weekClose.closed.length > 0 && (
            <p className="mb-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
              השבוע הקודם נסגר ונשמר בארכיון.
            </p>
          )}
          {data.weekClose.errors > 0 && (
            <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              סגירת השבוע הקודם לא הצליחה. המערכת תנסה שוב בכניסה הבאה.
            </p>
          )}
          {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

          <WeekBar week={d.week} openToday={d.openToday} storeMode={data.storeMode} />

          {/* Revenue − costs = net. Pay counts the whole week (it's already committed). */}
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              icon={<ShoppingBag className="h-4 w-4" />}
              label={OT.kpi.orders}
              value={String(f.ordersCount)}
              sub={`${f.websiteOrdersCount} באתר · ${f.stallSalesCount} בדוכנים`}
            />
            <Kpi
              icon={<TrendingUp className="h-4 w-4" />}
              label={OT.kpi.revenue}
              value={formatILS(f.revenue.total)}
              sub={`${OT.kpi.website} ${formatILS(f.revenue.website)} · ${OT.kpi.stalls} ${formatILS(f.revenue.stalls)}`}
            />
            <Kpi
              icon={<Receipt className="h-4 w-4" />}
              label={OT.kpi.costs}
              value={formatILS(f.supplierCost + f.expenses.total + f.payroll)}
              sub={`ספק ${formatILS(f.supplierCost)} · הוצאות ${formatILS(f.expenses.total)} · שכר ${formatILS(f.payroll)}`}
            />
            <Kpi
              icon={<Wallet className="h-4 w-4" />}
              label={OT.kpi.net}
              value={formatILS(f.netProfit)}
              tone={f.netProfit >= 0 ? "good" : "bad"}
              sub="הכנסות פחות כל העלויות"
            />
          </div>

          <Tabs tabs={TABS} value={tab} onChange={setTab} />
          <div className="mt-4">
            {tab === "products" && <ProductsTab data={d} />}
            {tab === "stalls" && <StallsTab data={d} />}
            {tab === "team" && <TeamTab data={d} />}
            {tab === "money" && <MoneyTab data={d} />}
            {tab === "supplier" && <SupplierTab data={d} />}
          </div>
        </>
      )}
    </div>
  );
}
