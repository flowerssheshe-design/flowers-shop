"use client";

import * as React from "react";
import { PackageCheck } from "lucide-react";
import { opsFetch } from "@/lib/staff/ops/client";
import { SupplyReceipts, type ReceiptLine } from "@/components/staff/work/SupplyReceipts";
import { Collapsible, ErrorBlock, LoadingBlock, useOpsData } from "./common";

type SupplyData = {
  source: "supplier" | "forecast";
  lines: ReceiptLine[];
  products: { id: string; title: string }[];
};

/**
 * "What arrived from the supplier", for the managers: how many of each bouquet
 * really came and what was paid. The website stock and the supplier cost follow.
 * The supply runner has the same screen in "מה הגיע" on the supply page.
 */
export function SupplyReceiptsPanel({ onChanged }: { onChanged?: () => void }) {
  const { data, error, loading, reload } = useOpsData<SupplyData>("/api/staff/supply", (u) => opsFetch(u));

  if (loading && !data) return <LoadingBlock />;
  if (error && !data) return <ErrorBlock message={error} onRetry={reload} />;
  if (!data) return null;

  const fixed = data.lines.filter((l) => l.received_qty !== null && l.received_qty !== undefined && l.received_qty !== l.qty).length;
  return (
    <Collapsible
      id="supply-receipts"
      title="מה הגיע מהספק"
      summary={data.source === "forecast" ? "ההזמנה מהספק עוד לא נשלחה" : fixed > 0 ? `${fixed} זרים עודכנו` : "כמו שהוזמן"}
      icon={<PackageCheck className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />}
    >
      <SupplyReceipts
        lines={data.lines}
        products={data.products}
        isForecast={data.source === "forecast"}
        onChanged={() => {
          void reload();
          onChanged?.();
        }}
      />
    </Collapsible>
  );
}
