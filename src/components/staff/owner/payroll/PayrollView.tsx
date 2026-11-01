"use client";

import * as React from "react";
import { StaffPageHeader } from "@/components/staff/StaffShell";
import { ErrorState, LoadingState, RefreshButton, Tabs, useStaffJson } from "@/components/staff/owner/shared";
import type { PayrollResponse } from "@/lib/staff/owner/pay-summary";
import { P } from "./labels";
import { RatesSection } from "./RatesSection";
import { EntriesSection } from "./EntriesSection";
import { SummarySection } from "./SummarySection";

type Tab = "rates" | "entries" | "summary";

/** The pay page (/staff/payroll), owners only. */
export function PayrollView() {
  const { data, error, loading, reload } = useStaffJson<PayrollResponse>("/api/staff/payroll");
  const [tab, setTab] = React.useState<Tab>("rates");

  return (
    <div className="space-y-4">
      <StaffPageHeader refresh={false}
        title={P.title}
        description={P.description}
        actions={<RefreshButton onClick={() => void reload()} loading={loading} />}
      />

      <Tabs<Tab>
        tabs={[
          { key: "rates", label: P.tabRates },
          { key: "entries", label: P.tabEntries },
          { key: "summary", label: P.tabSummary },
        ]}
        value={tab}
        onChange={setTab}
      />

      {data && !data.ready && (
        <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {P.notReady}
        </p>
      )}

      {loading && !data ? (
        <LoadingState />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={() => void reload()} />
      ) : data ? (
        tab === "rates" ? (
          <RatesSection data={data} onChanged={() => void reload()} />
        ) : tab === "entries" ? (
          <EntriesSection data={data} onChanged={() => void reload()} />
        ) : (
          <SummarySection data={data} />
        )
      ) : null}
    </div>
  );
}
