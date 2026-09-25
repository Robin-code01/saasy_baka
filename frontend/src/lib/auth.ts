// src/lib/auth.ts
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "https://fourloop-backend.robinrangi.com";

const SESSION_KEY = "session";

export type AuthUser = {
  user_id: number;
  username: string;
};

/** Save the user returned by /api/login/ so the frontend can gate routes. */
export function saveSession(user: AuthUser) {
  if (typeof window !== "undefined") {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  }
}

/** Read the session stored at login. Returns null if logged out / missing. */
export function getSession(): AuthUser | null {
  try {
    if (typeof window === "undefined") {
      return null;
    }
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<AuthUser>;
    if (
      typeof parsed.user_id !== "number" ||
      typeof parsed.username !== "string"
    ) {
      clearSession();
      return null;
    }

    return { user_id: parsed.user_id, username: parsed.username };
  } catch {
    clearSession();
    return null;
  }
}

export function clearSession() {
  if (typeof window !== "undefined") {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem("authToken");
    localStorage.removeItem("accessToken");
    localStorage.removeItem("username");
  }
}

/** Fetch user profile from backend as fallback if session is missing or needs refresh */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const cached = getSession();
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/profile/`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (
      typeof data?.user_id === "number" &&
      typeof data?.username === "string"
    ) {
      const user: AuthUser = { user_id: data.user_id, username: data.username };
      saveSession(user);
      return user;
    }
  } catch {
    // Ignore network errors
  }

  return null;
}

export async function logoutSession(): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/api/logout/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
    });
  } catch (err) {
    console.error("Sign out failed:", err);
  } finally {
    clearSession();
  }
}