import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { ForgotPasswordView } from "@/components/ForgotPasswordView";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  const user = await getSessionUser();
  if (user) {
    redirect("/profile");
  }
  return <ForgotPasswordView />;
}
