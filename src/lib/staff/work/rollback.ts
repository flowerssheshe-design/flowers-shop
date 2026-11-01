// Runs a list of steps; when one fails, undoes the ones that already ran (in
// reverse order). Used where several Supabase calls must succeed together and
// we have no single transaction (stall sale, distribution).

export type Step = {
  run: () => Promise<void>;
  undo?: () => Promise<void>;
};

export class StepError extends Error {
  constructor(
    message: string,
    /** HTTP status the route should answer with. */
    public status = 500,
  ) {
    super(message);
    this.name = "StepError";
  }
}

export type StepsResult =
  | { ok: true }
  | { ok: false; error: unknown; undoFailures: number };

export async function runWithRollback(steps: Step[]): Promise<StepsResult> {
  const done: Step[] = [];
  for (const step of steps) {
    try {
      await step.run();
      done.push(step);
    } catch (error) {
      let undoFailures = 0;
      for (const prev of done.reverse()) {
        if (!prev.undo) continue;
        try {
          await prev.undo();
        } catch (e) {
          undoFailures += 1;
          console.error("rollback step failed:", e);
        }
      }
      return { ok: false, error, undoFailures };
    }
  }
  return { ok: true };
}
