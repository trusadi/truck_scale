import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySessionCookie, SESSION_COOKIE_NAME } from "@/lib/auth-server";
import TruckQueue from "./truck-queue";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export default async function Home() {
  const session = await verifySessionCookie(
    (await cookies()).get(SESSION_COOKIE_NAME)?.value,
  );
  if (!session) redirect("/login");
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return <TruckQueue today={today} />;
}
