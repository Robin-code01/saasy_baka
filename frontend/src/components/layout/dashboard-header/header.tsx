// src/components/layout/dashboard-header/header.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProppyLogo } from "@/components/ui/logo";
import cn from "@/utils/cn";
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { getCurrentUser, getSession, logoutSession } from "@/lib/auth";

export interface HeaderProps {
  /** Placeholder or custom company name */
  companyName?: string;
  /** Username to display (optional override) */
  username?: string;
  /** Controlled signed-in state (optional) */
  isSignedIn?: boolean;
  /** Callback fired when user clicks Sign In */
  onSignIn?: () => void;
  /** Callback fired when user clicks Sign Out */
  onSignOut?: () => void;
  /** Additional styling classes */
  className?: string;
}

export function Header({
  companyName = "Company Name",
  username: propUsername,
  onSignOut,
  className,
}: HeaderProps) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = React.useState(false);
  const [username, setUsername] = React.useState<string>(propUsername || "");

  React.useEffect(() => {
    if (propUsername) {
      setUsername(propUsername);
      return;
    }

    const session = getSession();
    if (session?.username) {
      setUsername(session.username);
    } else {
      void getCurrentUser().then((user) => {
        if (user?.username) {
          setUsername(user.username);
        }
      });
    }
  }, [propUsername]);

  const userInitial = React.useMemo(() => {
    if (!username) return "U";
    return username.trim().charAt(0).toUpperCase() || "U";
  }, [username]);

  const handleSignOut = async () => {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);
    try {
      await logoutSession();
      onSignOut?.();
      router.replace("/");
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full border-b border-border bg-background/90 backdrop-blur-md transition-colors",
        className,
      )}
    >
      <div className="relative mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Navigation Logo Link */}
        <Link href="/dashboard" className="group flex items-center gap-2.5">
          <ProppyLogo />
          <span className="text-xl font-bold tracking-tight text-foreground">
            {companyName}
          </span>
        </Link>

        <div className="flex items-center gap-3">
          <DropdownMenuRoot>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="group flex items-center gap-2 rounded-full border border-border bg-background/90 p-1 sm:pr-3 text-xs font-medium text-foreground transition-all hover:border-foreground/30 hover:bg-lightgrey/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
                aria-label="User account menu"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-lightgrey font-mono text-xs font-bold text-foreground transition-colors group-hover:bg-lightgrey/80">
                  {userInitial}
                </span>
                {username ? (
                  <span className="font-mono text-xs font-medium text-foreground max-w-[120px] truncate">
                    {username}
                  </span>
                ) : null}
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent className="mt-2 min-w-52 p-2" align="end">
              {/* Single Clickable Profile Action */}
              <DropdownMenuItem
                onClick={() => router.push("/profile")}
                className="group/user flex items-center justify-between gap-2.5 rounded-lg p-2 transition-colors hover:bg-stone-100 focus:bg-stone-100 cursor-pointer"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-lightgrey font-mono text-xs font-bold text-foreground transition-colors group-hover/user:bg-stone-300">
                    {userInitial}
                  </span>
                  <div className="flex min-w-0 flex-col">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-foreground/60">
                      Company Profile
                    </span>
                    <span className="truncate font-mono text-xs font-semibold text-foreground">
                      {username || "User"}
                    </span>
                  </div>
                </div>
                <svg
                  className="h-3.5 w-3.5 shrink-0 text-stone-400 transition-transform group-hover/user:translate-x-0.5 group-hover/user:text-foreground"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </DropdownMenuItem>

              <DropdownMenuSeparator className="-mx-2 my-1" />

              {/* Matched Tenders Dashboard Link */}
              <DropdownMenuItem
                onClick={() => router.push("/dashboard")}
                className="flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-lightgrey/60 focus:bg-lightgrey/60 cursor-pointer"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3.5 w-3.5 text-foreground/60"
                >
                  <rect width="7" height="9" x="3" y="3" rx="1" />
                  <rect width="7" height="5" x="14" y="3" rx="1" />
                  <rect width="7" height="9" x="14" y="12" rx="1" />
                  <rect width="7" height="5" x="3" y="16" rx="1" />
                </svg>
                <span>Matched Tenders</span>
              </DropdownMenuItem>

              <DropdownMenuSeparator className="-mx-2 my-1" />

              {/* Sign Out Action */}
              <DropdownMenuItem
                onClick={() => {
                  void handleSignOut();
                }}
                disabled={isSigningOut}
                className="flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-lightgrey/60 focus:bg-lightgrey/60 cursor-pointer disabled:opacity-50"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3.5 w-3.5 text-foreground/60"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                <span>{isSigningOut ? "Signing out..." : "Sign Out"}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenuRoot>
        </div>
      </div>
    </header>
  );
}

export { Header as DashboardHeader };
export default Header;