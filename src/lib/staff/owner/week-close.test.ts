import { describe, it, expect } from "vitest";
import {
  canClaim,
  ensureWeekClosed,
  type OpenWeekRow,
  type PayrollSnapshot,
  type WeekCloseData,
  type WeekCloseStore,
} from "./week-close";
import type { OrderRow } from "./week-math";

const SETTINGS = { supplier_order_day: 2, supplier_order_time: "12:00", week_close_day: 6, week_close_time: "21:00" };
const NOW = new Date("2026-11-10T08:00:00Z"); // Tuesday of the week starting 2026-11-08
const PREV = "2026-11-01";

type Row = OpenWeekRow & { supplier_ordered_at: string | null };

function memoryStore(opts: { rows?: Row[]; data?: Partial<WeekCloseData>; failArchive?: boolean } = {}) {
  const weeks = new Map<string, Row>((opts.rows ?? []).map((r) => [r.week_start, { ...r }]));
  const archives: Record<string, unknown>[] = [];
  const payroll = new Map<string, PayrollSnapshot>();
  const orders: OrderRow[] = [
    { id: "o1", created_at: "2026-11-02T10:00:00Z", status: "approved", total_amount: 100, items: [{ productId: "p", qty: 1, price: 100 }] },
    { id: "o2", created_at: "2026-11-03T10:00:00Z", status: "cancelled", total_amount: 50, items: [] },
  ];
  let stockResets = 0;
  const archivedIds = new Set<string>();

  const store: WeekCloseStore = {
    async ensureWeekRow(weekStart) {
      if (!weeks.has(weekStart)) {
        weeks.set(weekStart, { week_start: weekStart, archive_id: null, close_started_at: null, closed_at: null, supplier_ordered_at: null });
      }
    },
    async openWeeksBefore(before) {
      return Array.from(weeks.values())
        .filter((w) => !w.closed_at && w.week_start < before)
        .sort((a, b) => a.week_start.localeCompare(b.week_start))
        .map((w) => ({ ...w }));
    },
    async claim(weekStart, now, staleBefore) {
      // Synchronous check-and-set = the atomic conditional UPDATE in SQL.
      const w = weeks.get(weekStart);
      if (!w || w.closed_at) return false;
      if (w.close_started_at && new Date(w.close_started_at) >= staleBefore) return false;
      w.close_started_at = now.toISOString();
      return true;
    },
    async release(weekStart) {
      const w = weeks.get(weekStart);
      if (w && !w.closed_at) w.close_started_at = null;
    },
    async finish(weekStart, archiveId, now) {
      const w = weeks.get(weekStart)!;
      w.closed_at = now.toISOString();
      w.archive_id = archiveId;
      w.close_started_at = null;
    },
    async loadWeekData() {
      await Promise.resolve();
      return {
        orders,
        products: [{ id: "p", title: "זר", cost_price: 40 }],
        expenses: [],
        employees: [{ id: "w1", full_name: "דנה", role: "worker", pay_type: "per_shift", pay_rate: 120 }],
        shifts: [{ employee_id: "w1", work_date: "2026-11-06", start_time: "08:00", end_time: "14:00" }],
        supplierLines: [],
        supplierOrdered: false,
        ...opts.data,
      };
    },
    async findArchive(weekStartIso) {
      const found = archives.find((a) => a.week_start === weekStartIso);
      return found ? String(found.id) : null;
    },
    async insertArchive(payload) {
      if (opts.failArchive) throw new Error("db down");
      const id = `arc-${archives.length + 1}`;
      archives.push({ ...payload, id });
      return id;
    },
    async upsertPayroll(rows) {
      for (const r of rows) payroll.set(`${r.week_start}:${r.employee_id}`, r);
    },
    async archiveOrders(ids) {
      ids.forEach((id) => archivedIds.add(id));
    },
    async isSupplierOrdered(weekStart) {
      return Boolean(weeks.get(weekStart)?.supplier_ordered_at);
    },
    async resetLiveStock() {
      stockResets += 1;
    },
  };
  return { store, weeks, archives, payroll, archivedIds, resets: () => stockResets };
}

describe("canClaim", () => {
  it("only open, unclaimed or stale weeks", () => {
    expect(canClaim({ closed_at: null, close_started_at: null }, NOW)).toBe(true);
    expect(canClaim({ closed_at: "2026-11-08T00:00:00Z", close_started_at: null }, NOW)).toBe(false);
    expect(canClaim({ closed_at: null, close_started_at: new Date(NOW.getTime() - 60_000).toISOString() }, NOW)).toBe(false);
    expect(canClaim({ closed_at: null, close_started_at: new Date(NOW.getTime() - 20 * 60_000).toISOString() }, NOW)).toBe(true);
  });
});

describe("ensureWeekClosed", () => {
  it("creates and closes the previous week, once", async () => {
    const m = memoryStore();
    const first = await ensureWeekClosed(m.store, SETTINGS, NOW);
    expect(first).toEqual({ closed: [PREV], skipped: [], errors: [] });
    expect(m.weeks.get(PREV)?.closed_at).toBe(NOW.toISOString());
    expect(m.weeks.get(PREV)?.archive_id).toBe("arc-1");
    expect(m.archives).toHaveLength(1);
    expect(m.archives[0]).toMatchObject({ total_revenue: 100, total_supplier_cost: 40, total_net_profit: 100 - 40 - 120 });
    expect(m.payroll.get(`${PREV}:w1`)).toMatchObject({ shifts_count: 1, hours: 6, amount: 120 });
    expect(Array.from(m.archivedIds)).toEqual(["o1"]);
    expect(m.resets()).toBe(1);

    const second = await ensureWeekClosed(m.store, SETTINGS, new Date(NOW.getTime() + 60_000));
    expect(second).toEqual({ closed: [], skipped: [], errors: [] });
    expect(m.archives).toHaveLength(1);
    expect(m.resets()).toBe(1);
  });

  it("two runs at the same time close the week once", async () => {
    const m = memoryStore();
    const [a, b] = await Promise.all([ensureWeekClosed(m.store, SETTINGS, NOW), ensureWeekClosed(m.store, SETTINGS, NOW)]);
    expect([...a.closed, ...b.closed]).toEqual([PREV]);
    expect([...a.skipped, ...b.skipped]).toEqual([PREV]);
    expect(m.archives).toHaveLength(1);
  });

  it("skips a week another run is closing, takes over a stale claim", async () => {
    const recent = memoryStore({
      rows: [{ week_start: PREV, archive_id: null, close_started_at: new Date(NOW.getTime() - 60_000).toISOString(), closed_at: null, supplier_ordered_at: null }],
    });
    expect((await ensureWeekClosed(recent.store, SETTINGS, NOW)).skipped).toEqual([PREV]);
    expect(recent.archives).toHaveLength(0);

    const stale = memoryStore({
      rows: [{ week_start: PREV, archive_id: null, close_started_at: new Date(NOW.getTime() - 30 * 60_000).toISOString(), closed_at: null, supplier_ordered_at: null }],
    });
    expect((await ensureWeekClosed(stale.store, SETTINGS, NOW)).closed).toEqual([PREV]);
  });

  it("reuses an archive written by a run that crashed half way", async () => {
    const m = memoryStore({
      rows: [{ week_start: PREV, archive_id: "arc-old", close_started_at: null, closed_at: null, supplier_ordered_at: null }],
    });
    await ensureWeekClosed(m.store, SETTINGS, NOW);
    expect(m.archives).toHaveLength(0);
    expect(m.weeks.get(PREV)?.archive_id).toBe("arc-old");
  });

  it("releases the claim when closing fails, so a later run retries", async () => {
    const m = memoryStore({ failArchive: true });
    const r = await ensureWeekClosed(m.store, SETTINGS, NOW);
    expect(r.errors).toEqual([{ week_start: PREV, error: "db down" }]);
    expect(m.weeks.get(PREV)?.closed_at).toBeNull();
    expect(m.weeks.get(PREV)?.close_started_at).toBeNull();
  });

  it("does not wipe live stock already set for the new week", async () => {
    const m = memoryStore({
      rows: [{ week_start: "2026-11-08", archive_id: null, close_started_at: null, closed_at: null, supplier_ordered_at: "2026-11-10T07:00:00Z" }],
    });
    await ensureWeekClosed(m.store, SETTINGS, NOW);
    expect(m.weeks.get(PREV)?.closed_at).not.toBeNull();
    expect(m.weeks.get("2026-11-08")?.closed_at).toBeNull();
    expect(m.resets()).toBe(0);
  });
});
