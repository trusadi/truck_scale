import type { Metadata } from "next";
import StatusBoard from "./status-board";

export const metadata: Metadata = {
  title: "Truck Status Board | San Miguel Foods",
  description: "Read-only live truck queue and processing board.",
};

export default function BoardPage() {
  return <StatusBoard />;
}
