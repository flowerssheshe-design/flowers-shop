import { describe, expect, it } from "vitest";
import { DEFAULT_REMINDERS, isReminderDue, parseReminders, renderReminder } from "./push-reminders";

describe("weekly push reminders", () => {
  const tue = DEFAULT_REMINDERS.tuesday;
  it("is due on its day from its hour, once a day", () => {
    expect(isReminderDue("tuesday", tue, { weekday: 2, hour: 8, date: "2026-11-10" }, null)).toBe(false);
    expect(isReminderDue("tuesday", tue, { weekday: 2, hour: 9, date: "2026-11-10" }, null)).toBe(true);
    expect(isReminderDue("tuesday", tue, { weekday: 2, hour: 15, date: "2026-11-10" }, "2026-11-10")).toBe(false);
    expect(isReminderDue("tuesday", tue, { weekday: 3, hour: 9, date: "2026-11-11" }, null)).toBe(false);
    expect(isReminderDue("tuesday", { ...tue, enabled: false }, { weekday: 2, hour: 9, date: "2026-11-10" }, null)).toBe(false);
  });

  it("fills {left} and skips when nothing is left", () => {
    const thu = DEFAULT_REMINDERS.thursday;
    expect(renderReminder(thu, { left: 12 })?.title).toContain("12");
    expect(renderReminder(thu, { left: 0 })).toBeNull();
    expect(renderReminder(tue, { left: null })?.title).toBe(tue.title);
  });

  it("reads a stored config with defaults", () => {
    const c = parseReminders({ thursday: { hour: 20 } });
    expect(c.thursday.hour).toBe(20);
    expect(c.thursday.title).toBe(DEFAULT_REMINDERS.thursday.title);
    expect(parseReminders("garbage")).toEqual(DEFAULT_REMINDERS);
  });
});

it("fills {deadline} from the supplier order time", () => {
  expect(renderReminder(DEFAULT_REMINDERS.tuesday, { left: null, deadline: "12:00" })?.body).toContain("עד 12:00");
});
