"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ProppyLogo } from "@/components/ui/logo";
import cn from "@/utils/cn";
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { logoutSession } from "@/lib/auth";

export interface HeaderProps {
  /** Placeholder or custom company name */
  companyName?: string;
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
  onSignOut,
  className,
}: HeaderProps) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = React.useState(false);

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
        {/* Stay on dashboard while logged in */}
        <Link href="/dashboard" className="group flex items-center gap-2.5">
          <ProppyLogo />
          <span className="text-xl font-bold tracking-tight text-foreground">
            {companyName}
          </span>
        </Link>

        <div className="flex items-center gap-3">
          <DropdownMenuRoot>
            <DropdownMenuTrigger asChild>
              <Button className="flex h-8 w-8 items-center justify-center rounded-full bg-lightgrey text-xs font-semibold text-foreground">
                U
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="mt-2">
              <DropdownMenuItem>Profile</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  void handleSignOut();
                }}
              >
                {isSigningOut ? "Signing out..." : "Signout"}
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
