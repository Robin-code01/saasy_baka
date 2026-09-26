// src/app/profile/layout.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Company Profile", // Renders as "Company Profile | Proppy"
};

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}