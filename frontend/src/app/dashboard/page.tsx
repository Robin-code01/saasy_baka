import { SessionGate } from "@/components/auth/session-gate";
import { Header } from "@/components/layout/dashboard-header/header";

export default function Dashboard() {
  return (
    <SessionGate mode="auth">
      <Header companyName="Proppy" />
      <main className="grid bg-lightgrey h-[calc(100vh-64px)] w-full pt-10 grid-cols-6 gap-10 px-10">
        <div className="bg-lightgrey h-full col-span-2">
        </div>
        <div className="bg-lightgrey h-full col-span-4"></div>
      </main>
    </SessionGate>
  );
}
