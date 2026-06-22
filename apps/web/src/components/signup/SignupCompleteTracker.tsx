/**
 * SignupCompleteTracker — fire-and-forget React island that marks the
 * authenticated user's signup flow as complete.
 *
 * Mounted in Step4Welcome. As soon as the welcome screen renders we POST
 * /api/auth/signup-complete (idempotent — backend only sets the column if
 * currently null). The user sees the welcome message immediately; the API
 * call runs in the background.
 *
 * If the user came from an anon demo game, Step1Save persisted the demo
 * score in `localStorage` under `signup.demoScore`. We forward it as
 * `initialRating` in the POST body. The backend applies it to
 * `users.rating` + `users.peak_rating` only when the row is still at the
 * default 1000, so a returning OAuth user can't be clobbered.
 *
 * Failure handling: if the request fails (network, server down, 401 because
 * the cookie expired between page load and mount), we swallow it. The user
 * can still play; the gate will simply not lock them out next time.
 *
 * Returns null — no visual rendering.
 */

import { useEffect } from "react";

const STORAGE_KEY = "signup.demoScore";

export function SignupCompleteTracker() {
  useEffect(() => {
    let initialRating: number | null = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw !== null) {
        const parsed = Number(raw);
        if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 4000) {
          initialRating = Math.floor(parsed);
        }
        // Always clear after read, even if it was malformed — we don't want
        // a stale value bleeding into the next signup.
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (_) {
      // localStorage may be disabled (private mode) — silently degrade.
    }

    const body: { initialRating?: number } = {};
    if (initialRating !== null) {
      body.initialRating = initialRating;
    }

    fetch("/api/auth/signup-complete", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {
      /* swallow — see file header */
    });
  }, []);

  return null;
}
