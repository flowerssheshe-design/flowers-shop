import { requireStaffPage } from "@/lib/staff/page-guard";
import { TasksView } from "@/components/staff/ops/TasksView";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { employee } = await requireStaffPage("tasks");
  return <TasksView me={employee} />;
}
