// src/app/dashboard/layout.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard", // Automatically renders as "Dashboard | Proppy"
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}