import { SessionGate } from "@/components/auth/session-gate";
import { Header } from "@/components/layout/landing-header/header";

export default function Home() {
  return (
    <SessionGate mode="guest">
      <Header companyName="some company" />
      <main className="flex-1">
        <div className="my-10 mx-10 flex">
          <div className="flex items-center justify-center h-60 aspect-square bg-background">
            <p className="text-2xl text-foreground">Background Color</p>
          </div>
          <div className="flex items-center justify-center h-60 aspect-square bg-lightgrey">
            <p className="text-2xl text-foreground">Primary Color</p>
          </div>
        </div>
      </main>
    </SessionGate>
  );
}
