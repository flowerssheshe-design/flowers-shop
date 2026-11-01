// Pure rules for an employee changing their own PIN in "my area".
// Lockout rules match /api/staff/login: 5 wrong PINs lock the account for 15 minutes.

export const PIN_MAX_FAILED_ATTEMPTS = 5;
export const PIN_LOCK_MINUTES = 15;

const PIN_RE = /^\d{4,8}$/;

export type PinChangeInput = {
  current_pin: string;
  new_pin: string;
  new_pin_confirm: string;
};

/** Checks the form before touching the DB. Returns a Hebrew error, or null when fine. */
export function checkPinChangeInput(input: Partial<PinChangeInput> | null | undefined): string | null {
  const current = String(input?.current_pin ?? "").trim();
  const next = String(input?.new_pin ?? "").trim();
  const confirm = String(input?.new_pin_confirm ?? "").trim();
  if (!current) return "הקלידו את הקוד הנוכחי שלכם.";
  if (!next) return "הקלידו קוד חדש.";
  if (!PIN_RE.test(next)) return "הקוד החדש צריך להיות 4 עד 8 ספרות, בלי אותיות או רווחים.";
  if (next !== confirm) return "הקוד החדש והאימות לא תואמים. הקלידו את אותו הקוד פעמיים.";
  if (next === current) return "הקוד החדש זהה לקוד הנוכחי. בחרו קוד אחר.";
  return null;
}

export function isPinLocked(lockedUntil: string | null | undefined, now: Date = new Date()): boolean {
  return !!lockedUntil && new Date(lockedUntil).getTime() > now.getTime();
}

/** What to save after a wrong current PIN (same as a failed login). */
export function failedPinUpdate(
  previousAttempts: number | null | undefined,
  now: Date = new Date(),
): { locked: boolean; update: { failed_pin_attempts: number; locked_until?: string } } {
  const attempts = (previousAttempts ?? 0) + 1;
  if (attempts >= PIN_MAX_FAILED_ATTEMPTS) {
    return {
      locked: true,
      update: {
        failed_pin_attempts: 0,
        locked_until: new Date(now.getTime() + PIN_LOCK_MINUTES * 60_000).toISOString(),
      },
    };
  }
  return { locked: false, update: { failed_pin_attempts: attempts } };
}

export const PIN_LOCKED_ERROR = "יותר מדי ניסיונות שגויים. נסו שוב בעוד 15 דקות.";
export const PIN_WRONG_ERROR = "הקוד הנוכחי שגוי. נסו שוב.";
