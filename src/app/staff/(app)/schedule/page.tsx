import { requireStaffPage } from "@/lib/staff/page-guard";
import { ScheduleView } from "@/components/staff/ops/ScheduleView";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { employee } = await requireStaffPage("schedule");
  return <ScheduleView me={employee} />;
}
