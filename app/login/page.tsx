import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySessionCookie, SESSION_COOKIE_NAME } from "@/lib/auth-server";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function LoginPage() {
  const session = await verifySessionCookie(
    (await cookies()).get(SESSION_COOKIE_NAME)?.value,
  );
  if (session) redirect("/");
  return <LoginForm />;
}
