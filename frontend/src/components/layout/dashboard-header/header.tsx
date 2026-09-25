"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import cn from "@/utils/cn";
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";

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
  isSignedIn: controlledIsSignedIn,
  onSignIn,
  onSignOut,
  className,
}: HeaderProps) {
  // Support both uncontrolled (internal demo state) and controlled props
  const [internalIsSignedIn, setInternalIsSignedIn] = React.useState(false);

  const isControlled = controlledIsSignedIn !== undefined;
  const signedIn = isControlled ? controlledIsSignedIn : internalIsSignedIn;

  const handleAuthToggle = () => {
    if (signedIn) {
      onSignOut?.();
    } else {
      onSignIn?.();
    }

    if (!isControlled) {
      setInternalIsSignedIn((prev) => !prev);
    }
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full border-b border-border bg-background/90 backdrop-blur-md transition-colors",
        className,
      )}
    >
      {/* Added 'relative' so the nav can center relative to this container */}
      <div className="relative mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Company Name */}
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="text-xl font-bold tracking-tight text-foreground">
            {companyName}
          </span>
        </Link>

        {/* Auth Button */}
        <div className="flex items-center gap-3">
          <DropdownMenuRoot>
            <DropdownMenuTrigger asChild>
              <Button className="flex h-8 w-8 items-center justify-center rounded-full bg-lightgrey text-xs font-semibold text-foreground">
                U
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>Profile</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Signout</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenuRoot>
        </div>
      </div>
    </header>
  );
}

export { Header as LandingHeader };
export default Header;
