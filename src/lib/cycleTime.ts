import { useSystemSettings } from "./useSystemSettings";

function toMinutes(time: string | undefined): number {
  if (!time) return 10 * 60; // default 10:00 = 600 minutes
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Returns true when the current time is before the pre-order deadline
 * (Sun-Thu). Always false on Friday/Saturday.
 * @param preorderDeadline - The preorder deadline in "HH:MM" format (required)
 */
export function isPreorderPhase(preorderDeadline: string): boolean {
  const deadline = preorderDeadline;
  const now = new Date();
  const day = now.getDay(); // 0=Sun ... 6=Sat
  if (day === 6) return false;
  if (day === 5) return false; // Friday is live stall (or closed after deadline)
  const current = now.getHours() * 60 + now.getMinutes();
  return current < toMinutes(deadline);
}

/**
 * Returns true on Friday before the same-day deadline.
 * @param sameDayDeadline - The same-day deadline in "HH:MM" format (required)
 */
export function isLiveStallPhase(sameDayDeadline: string): boolean {
  const deadline = sameDayDeadline;
  const now = new Date();
  const day = now.getDay();
  if (day === 6) return false;
  if (day !== 5) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  return current < toMinutes(deadline);
}

/**
 * Returns true when ordering is currently open.
 * @param options - Object containing preorderDeadline and sameDayDeadline (both required)
 */
export function isOrderingOpen(options: {
  preorderDeadline: string;
  sameDayDeadline: string;
}): boolean {
  const preorderDeadline = options.preorderDeadline;
  const sameDayDeadline = options.sameDayDeadline;
  const now = new Date();
  const day = now.getDay();
  if (day === 6) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  if (day === 5) return current < toMinutes(sameDayDeadline);
  return true; // Sun-Thu open for pre-orders
}

/**
 * Hook-based wrapper that reads deadlines from system settings.
 * Safe to call from any client component.
 */
export function useCycleTime() {
  const settings = useSystemSettings();
  const preorderDeadline = settings.preorder_deadline ?? "10:00";
  const sameDayDeadline = settings.same_day_deadline ?? "13:00";
  return {
    preorderDeadline,
    sameDayDeadline,
    isPreorderPhase: isPreorderPhase(preorderDeadline),
    isLiveStallPhase: isLiveStallPhase(sameDayDeadline),
    isOrderingOpen: isOrderingOpen({
      preorderDeadline,
      sameDayDeadline,
    }),
  };
}