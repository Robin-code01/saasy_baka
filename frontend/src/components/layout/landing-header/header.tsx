// src/components/layout/landing-header/header.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ProppyLogo } from "@/components/ui/logo";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import cn from "@/utils/cn";
import { API_BASE_URL, saveSession } from "@/lib/auth";

export interface HeaderProps {
  companyName?: string;
  className?: string;
}

export function Header({ companyName = "Proppy", className }: HeaderProps) {
  const router = useRouter();

  // Dialog & Form State
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [isRegisterDialogOpen, setIsRegisterDialogOpen] = React.useState(false);
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [registerUsername, setRegisterUsername] = React.useState("");
  const [registerPassword, setRegisterPassword] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/login/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const errorMsg =
          data?.detail ||
          data?.message ||
          data?.error ||
          (Array.isArray(data?.non_field_errors)
            ? data.non_field_errors[0]
            : null) ||
          "Invalid username or password. Please try again.";
        throw new Error(errorMsg);
      }

      if (data?.token) {
        localStorage.setItem("authToken", data.token);
      } else if (data?.access) {
        localStorage.setItem("accessToken", data.access);
      }

      if (
        typeof data?.user_id === "number" &&
        typeof data?.username === "string"
      ) {
        saveSession({ user_id: data.user_id, username: data.username });
      }

      setIsDialogOpen(false);
      setUsername("");
      setPassword("");

      router.push("/dashboard");
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An unexpected error occurred. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const trimmedUsername = registerUsername.trim();
      const response = await fetch(`${API_BASE_URL}/api/register/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          username: trimmedUsername,
          password: registerPassword,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const errorMsg =
          data?.detail ||
          data?.message ||
          data?.error ||
          (Array.isArray(data?.non_field_errors)
            ? data.non_field_errors[0]
            : null) ||
          "Invalid username or password. Please try again.";
        throw new Error(errorMsg);
      }

      // Automatically log the newly registered user in to establish the session cookie
      try {
        const loginRes = await fetch(`${API_BASE_URL}/api/login/`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            username: trimmedUsername,
            password: registerPassword,
          }),
        });

        const loginData = await loginRes.json().catch(() => null);

        if (loginData?.token) {
          localStorage.setItem("authToken", loginData.token);
        } else if (loginData?.access) {
          localStorage.setItem("accessToken", loginData.access);
        }

        const activeUserId = loginData?.user_id ?? data?.user_id;
        const activeUsername = loginData?.username ?? data?.username;

        if (
          typeof activeUserId === "number" &&
          typeof activeUsername === "string"
        ) {
          saveSession({ user_id: activeUserId, username: activeUsername });
        }
      } catch (loginErr) {
        console.warn("Auto-login error after registration:", loginErr);
        if (
          typeof data?.user_id === "number" &&
          typeof data?.username === "string"
        ) {
          saveSession({ user_id: data.user_id, username: data.username });
        }
      }

      setIsRegisterDialogOpen(false);
      setRegisterUsername("");
      setRegisterPassword("");

      // Redirect directly to the profile setup page so the company can be set up
      router.push("/profile");
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An unexpected error occurred. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-md transition-colors",
        className,
      )}
    >
      <div className="relative mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Company Name & Logo */}
        <Link href="/" className="group flex items-center gap-2.5">
          <ProppyLogo />
          <span className="text-xl font-bold tracking-tight text-foreground transition-colors group-hover:text-foreground/90">
            {companyName}
          </span>
        </Link>

        {/* Guest Auth Action */}
        <div className="flex gap-3">
          <div className="flex items-center gap-3">
            <Dialog
              open={isRegisterDialogOpen}
              onOpenChange={(open: boolean) => {
                setIsRegisterDialogOpen(open);
                if (!open) {
                  setError(null);
                }
              }}
            >
              <DialogTrigger asChild>
                <Button
                  variant="register"
                  size="sm"
                  className="hover:opacity-90 transition-opacity"
                >
                  Sign up
                </Button>
              </DialogTrigger>
              <DialogContent className="w-full max-w-sm">
                <DialogTitle>Sign up</DialogTitle>
                <DialogDescription className="text-center mt-1">
                  Enter your credentials to register your account.
                </DialogDescription>

                <form
                  onSubmit={handleRegister}
                  className="mt-4 flex flex-col gap-4"
                >
                  {error && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-center text-xs text-red-600">
                      {error}
                    </div>
                  )}

                  <div className="flex flex-col gap-1.5 text-left">
                    <label
                      htmlFor="username"
                      className="text-xs font-medium text-foreground"
                    >
                      Username
                    </label>
                    <input
                      id="username"
                      name="username"
                      type="text"
                      required
                      autoComplete="username"
                      value={registerUsername}
                      onChange={(e) => setRegisterUsername(e.target.value)}
                      placeholder="Username"
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-foreground"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5 text-left">
                    <label
                      htmlFor="password"
                      className="text-xs font-medium text-foreground"
                    >
                      Password
                    </label>
                    <input
                      id="password"
                      name="password"
                      type="password"
                      required
                      autoComplete="new-password"
                      value={registerPassword}
                      onChange={(e) => setRegisterPassword(e.target.value)}
                      placeholder="Password"
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-foreground"
                    />
                  </div>

                  <Button
                    type="submit"
                    isLoading={isLoading}
                    className="mt-2 w-full"
                  >
                    Sign up
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          <div className="flex items-center gap-3">
            <Dialog
              open={isDialogOpen}
              onOpenChange={(open: boolean) => {
                setIsDialogOpen(open);
                if (!open) {
                  setError(null);
                }
              }}
            >
              <DialogTrigger asChild>
                <Button
                  variant="login"
                  size="sm"
                  className="hover:opacity-90 transition-opacity"
                >
                  Login
                </Button>
              </DialogTrigger>
              <DialogContent className="w-full max-w-sm">
                <DialogTitle>Sign In</DialogTitle>
                <DialogDescription className="text-center mt-1">
                  Enter your credentials to access your account.
                </DialogDescription>

                <form
                  onSubmit={handleSignIn}
                  className="mt-4 flex flex-col gap-4"
                >
                  {error && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-center text-xs text-red-600">
                      {error}
                    </div>
                  )}

                  <div className="flex flex-col gap-1.5 text-left">
                    <label
                      htmlFor="signin-username"
                      className="text-xs font-medium text-foreground"
                    >
                      Username
                    </label>
                    <input
                      id="signin-username"
                      name="username"
                      type="text"
                      required
                      autoComplete="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Username"
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-foreground"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5 text-left">
                    <label
                      htmlFor="signin-password"
                      className="text-xs font-medium text-foreground"
                    >
                      Password
                    </label>
                    <input
                      id="signin-password"
                      name="password"
                      type="password"
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password"
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-foreground"
                    />
                  </div>

                  <Button
                    type="submit"
                    isLoading={isLoading}
                    className="mt-2 w-full"
                  >
                    Login
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    </header>
  );
}

export { Header as LandingHeader };
export default Header;