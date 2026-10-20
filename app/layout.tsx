import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Truck Scale | San Miguel Foods",
  description:
    "Truck queueing, inbound and outbound weighing, weight approvals, QR tracking, and a live truck status board.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
