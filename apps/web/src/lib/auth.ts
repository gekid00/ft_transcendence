/**
 * Server-side auth helpers for Astro SSR pages.
 *
 * `getCurrentUser(astro)` validates the auth_token cookie against the
 * backend's /api/auth/me and returns the full user object (or null if
 * unauthenticated / unreachable). `isAuthenticated` is the boolean shorthand
 * — most callers only need to know "yes/no", but the signup gate also reads
 * `signupCompletedAt` to lock out users who already finished the flow.
 *
 * Both helpers fail closed (return null / false on network errors / timeouts)
 * to avoid rendering a form that's going to 401 on submit. Worst case: a
 * real authed user briefly redirects to /signup?step=1 and retries.
 */

interface AstroLike {
  cookies: { get(name: string): { value?: string } | undefined };
}

export type Title =
  | "Beginner"
  | "Apprentice"
  | "Expert"
  | "Master"
  | "Grandmaster";

export interface CurrentUser {
  id: number;
  email: string;
  username: string;
  avatarUrl: string | null;
  bio: string | null;
  /** ISO timestamp; non-null once the user reached /signup?step=4. */
  signupCompletedAt: string | null;
  /** Current Elo rating (HANDOFF §3.2). Default 1000 for new users. */
  rating: number;
  /** Highest rating ever achieved. */
  peakRating: number;
  /** Number of games played. */
  gamesPlayed: number;
  /** 1-based global rank, matches the /api/leaderboard ordering. */
  rank: number;
  /** Derived from `rating` (Beginner/Apprentice/Expert/Master/Grandmaster). */
  title: Title;
  pawnSkin?: string;
  gridSkin?: string;
}

/** Backend URL — `http://server:3000` inside compose, `localhost:3000` for `make dev`. */
function backendUrl(): string {
  return process.env.BACKEND_URL ?? "http://localhost:3000";
}

export async function getCurrentUser(astro: AstroLike): Promise<CurrentUser | null> {
  const authToken = astro.cookies.get("auth_token")?.value;
  if (!authToken) return null;

  try {
    const res = await fetch(`${backendUrl()}/api/auth/me`, {
      headers: { Cookie: `auth_token=${authToken}` },
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return null;
    return (await res.json()) as CurrentUser;
  } catch {
    return null;
  }
}

export async function isAuthenticated(astro: AstroLike): Promise<boolean> {
  return (await getCurrentUser(astro)) !== null;
}
