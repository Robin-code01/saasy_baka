import { SessionGate } from "@/components/auth/session-gate";
import { Header } from "@/components/layout/dashboard-header/header";

export default function Dashboard() {
  return (
    <SessionGate mode="auth">
      <Header companyName="some company" />
    </SessionGate>
  );
}
