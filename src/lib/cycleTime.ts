export const PREORDER_DEADLINE =
  process.env.NEXT_PUBLIC_PREORDER_DEADLINE ?? "10:00";
export const SAME_DAY_DEADLINE =
  process.env.NEXT_PUBLIC_SAME_DAY_DEADLINE ?? "13:00";

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function isPreorderPhase(): boolean {
  const now = new Date();
  const day = now.getDay(); // 0=Sun ... 6=Sat
  if (day === 6) return false;
  if (day === 5) return false; // Friday is live stall (or closed after deadline)
  const current = now.getHours() * 60 + now.getMinutes();
  return current < toMinutes(PREORDER_DEADLINE);
}

export function isLiveStallPhase(): boolean {
  const now = new Date();
  const day = now.getDay();
  if (day === 6) return false;
  if (day !== 5) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  return current < toMinutes(SAME_DAY_DEADLINE);
}

export function isOrderingOpen(): boolean {
  const now = new Date();
  const day = now.getDay();
  if (day === 6) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  if (day === 5) return current < toMinutes(SAME_DAY_DEADLINE);
  return true; // Sun-Thu open for pre-orders
}
