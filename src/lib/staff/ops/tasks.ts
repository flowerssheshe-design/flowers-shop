// Shapes for the tasks page (shared by the server and the screen).

export type TaskGroup = "owner" | "ops" | "orders";

export type Task = {
  id: string;
  group: TaskGroup;
  title: string;
  /** One more line: names, amounts, what is missing. */
  detail?: string;
  /** Where "לבצע" goes. */
  href: string;
};

export const TASK_GROUP_LABELS: Record<TaskGroup, string> = {
  owner: "מנהל ראשי",
  ops: "מנהל משמרות",
  orders: "הזמנות",
};
