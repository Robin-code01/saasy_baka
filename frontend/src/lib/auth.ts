export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "https://fourloop-backend.robinrangi.com";

const SESSION_KEY = "session";

export type AuthUser = {
  user_id: number;
  username: string;
};

/** Save the user returned by /api/login/ so the frontend can gate routes. */
export function saveSession(user: AuthUser) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

/** Read the session stored at login. Returns null if logged out / missing. */
export function getSession(): AuthUser | null {
  try {
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
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem("authToken");
  localStorage.removeItem("accessToken");
  localStorage.removeItem("username");
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
