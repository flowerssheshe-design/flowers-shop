import { requireStaffPage } from "@/lib/staff/page-guard";
import { TeamView } from "@/components/staff/ops/TeamView";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { employee } = await requireStaffPage("team");
  return <TeamView me={employee} />;
}
