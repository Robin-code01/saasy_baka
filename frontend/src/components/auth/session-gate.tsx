"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";

type SessionGateProps = {
  /** guest: landing (redirect to dashboard if logged in). auth: dashboard (redirect to / if logged out). */
  mode: "guest" | "auth";
  children: React.ReactNode;
};

export function SessionGate({ mode, children }: SessionGateProps) {
  const router = useRouter();
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    const user = getSession();

    if (mode === "guest" && user) {
      router.replace("/dashboard");
      return;
    }

    if (mode === "auth" && !user) {
      router.replace("/");
      return;
    }

    setReady(true);
  }, [mode, router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-foreground/60">
        Loading...
      </div>
    );
  }

  return <>{children}</>;
}
