// Who decides how the bouquets are split between the stalls, and per-stall totals.
// A manager (owner / ops manager) decides it; the supply runner only sees it.

import { hasRole, type StaffIdentity } from "@/lib/staff/access";

/** Only owners and ops managers decide how many bouquets go to each stall. */
export function canDecideDistribution(who: StaffIdentity): boolean {
  return hasRole(who, "owner") || hasRole(who, "ops_manager");
}

export type DistributionLogRow = {
  stall_id: string;
  product_id: string;
  qty: number;
};

/** Totals per stall and product, for "already distributed today". */
export function totalsByStall(rows: DistributionLogRow[]): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    const stall = (out[r.stall_id] ??= {});
    stall[r.product_id] = (stall[r.product_id] ?? 0) + (Number(r.qty) || 0);
  }
  return out;
}
