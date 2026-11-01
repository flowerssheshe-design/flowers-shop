import { requireStaffPage } from "@/lib/staff/page-guard";
import { StallsView } from "@/components/staff/ops/StallsView";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { employee } = await requireStaffPage("stalls");
  return <StallsView me={employee} />;
}
