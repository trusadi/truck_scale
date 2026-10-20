import type { Metadata } from "next";
import Tracker from "../tracker";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "My Truck Delivery | San Miguel Foods",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function TrackingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <Tracker token={token} />;
}
