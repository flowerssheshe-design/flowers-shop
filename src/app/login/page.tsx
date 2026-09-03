import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { LoginPageView } from "@/components/LoginPageView";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) {
    redirect("/profile");
  }
  return <LoginPageView />;
}