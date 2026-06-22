/**
 * Client for /api/profile* and /api/auth/oauth42/* endpoints.
 *
 * All endpoints require auth — the auth_token cookie is sent
 * automatically via `credentials: "include"`. Errors throw
 * `ProfileApiError` with a typed code + the server's message +
 * the HTTP status, mirroring `play-api.ts`'s PlayApiError.
 *
 * Used by the /settings React islands (SettingsProfile,
 * SettingsAppearance, SettingsAccount). The /settings page SSR
 * path uses ~/lib/auth → getCurrentUser for the initial read
 * (no fetch needed when the cookie is already validated).
 */

import type { Title } from "~/lib/auth";

export interface ProfileMe {
  id: number;
  email: string;
  username: string;
  avatarUrl: string | null;
  bio: string | null;
  pawnSkin: string;
  gridSkin: string;
  oauth42Linked: boolean;
  rating: number;
  peakRating: number;
  rank: number;
  title: Title;
  /** ISO 8601 of the last successful PUT /api/profile/password. null
   *  for OAuth-only accounts that have never set a password. Surfaced
   *  in /settings under the Password row as "Last changed · …". */
  passwordChangedAt: string | null;
}

export interface ProfileUpdate {
  id: number;
  username: string;
  bio: string | null;
  pawnSkin: string;
  gridSkin: string;
}

export type ProfileErrorCode =
  | "INVALID_BODY"
  | "INVALID_USERNAME"
  | "USERNAME_TAKEN"
  | "BIO_TOO_LONG"
  | "INVALID_SKIN"
  | "INVALID_FILE"
  | "FILE_TOO_LARGE"
  | "WRONG_PASSWORD"
  | "EMAIL_IN_USE"
  | "PASSWORD_REQUIRED"
  | "PASSWORD_TOO_SHORT"
  | "PASSWORD_SAME_AS_CURRENT"
  | "OAUTH_NOT_LINKED"
  | "OAUTH_UNLINK_BLOCKED"
  | "NOT_AUTHED"
  | "INTERNAL"
  | "NETWORK";

export class ProfileApiError extends Error {
  constructor(
    public readonly code: ProfileErrorCode,
    message: string,
    public readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "ProfileApiError";
  }
}

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

async function requestJson<T>(
  url: string,
  init: RequestInit = {},
): Promise<T> {
  let res: Response;
  try {
    const headers: Record<string, string> = {
      ...JSON_HEADERS,
      ...(init.headers as Record<string, string> | undefined),
    };
    res = await fetch(url, { ...init, credentials: "include", headers });
  } catch (e) {
    throw new ProfileApiError(
      "NETWORK",
      e instanceof Error ? e.message : "Network error",
    );
  }
  return parseJson<T>(res);
}

// Bodyless request variant — does NOT set Content-Type. Used for DELETE
// (account deletion) and any other call that has no body. Without this,
// a DELETE that goes through requestJson() would pin
// Content-Type: application/json on an empty body, and Fastify returns
// 400 FST_ERR_CTP_EMPTY_JSON_BODY (verified live at
// http://localhost:3000/api/profile). This mirrors how `fetch` already
// correctly omits Content-Type for bodyless requests — we just have to
// not interfere.
async function requestVoid<T>(
  url: string,
  init: RequestInit = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, credentials: "include" });
  } catch (e) {
    throw new ProfileApiError(
      "NETWORK",
      e instanceof Error ? e.message : "Network error",
    );
  }
  return parseJson<T>(res);
}

async function parseJson<T>(res: Response): Promise<T> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    // The backend returns a stable `code` for every error site that
    // the client branches on. Fall back to INTERNAL when the response
    // shape is unexpected (network proxy, 502 from upstream, etc.).
    // The server's `error` is the human-readable message; we trust it
    // directly so the user sees the backend's wording when the client
    // has no opinion.
    const b = body as { error?: string; code?: string; message?: string } | null;
    const code = (b?.code ?? "INTERNAL") as ProfileErrorCode;
    const message = b?.error ?? b?.message ?? `Request failed with status ${res.status}`;
    throw new ProfileApiError(code, message, res.status);
  }
  return body as T;
}

// ─── Read ─────────────────────────────────────────────────────────────

export function fetchMyProfile(): Promise<ProfileMe> {
  return requestJson<ProfileMe>("/api/profile", { method: "GET" });
}

export function checkUsername(
  q: string,
): Promise<{ available: boolean }> {
  // Public endpoint, used by both the signup flow and the settings page's
  // live availability check. Backend returns { available: false } for any
  // malformed input — so we only branch on res.ok (network) and treat the
  // body as the source of truth for the actual availability.
  return requestJson<{ available: boolean }>(
    `/api/users/check-username?q=${encodeURIComponent(q)}`,
    { method: "GET" },
  );
}

// ─── Update (username, bio, skins) ────────────────────────────────────

export function updateProfile(
  patch: Partial<{
    username: string;
    bio: string;
    pawnSkin: string;
    gridSkin: string;
  }>,
): Promise<ProfileUpdate> {
  return requestJson<ProfileUpdate>("/api/profile", {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}

// ─── Email + password (re-auth) ──────────────────────────────────────

export function updateEmail(args: {
  currentPassword: string;
  newEmail: string;
}): Promise<{ email: string }> {
  return requestJson<{ email: string }>("/api/profile/email", {
    method: "PUT",
    body: JSON.stringify(args),
  });
}

export function updatePassword(args: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ message: string; passwordChangedAt: string }> {
  return requestJson<{ message: string; passwordChangedAt: string }>(
    "/api/profile/password",
    {
      method: "PUT",
      body: JSON.stringify(args),
    },
  );
}

// ─── Avatar (multipart) ──────────────────────────────────────────────

// Mirrors the fileSize limit on the backend
// (apps/server/src/server.ts → multipart plugin: 2 MB). Kept as a
// constant here so the pre-validation in uploadAvatar() can short-
// circuit before the roundtrip — without it, the user gets a 413 from
// @fastify/multipart (or, now that the backend catches it, a typed
// FILE_TOO_LARGE response), but the request has already shipped the
// whole file. Pre-validating saves bandwidth and gives instant
// feedback.
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

export function uploadAvatar(file: File): Promise<{ avatarUrl: string }> {
  // Pre-validate the size. The server's multipart plugin would also
  // reject the file, but doing it client-side means the user gets the
  // error before the file has been streamed to the server.
  if (file.size > AVATAR_MAX_BYTES) {
    return Promise.reject(
      new ProfileApiError(
        "FILE_TOO_LARGE",
        "Image must be 2 MB or smaller.",
      ),
    );
  }
  // Inlined fetch — requestJson() spreads JSON_HEADERS (Content-Type:
  // application/json) into the request headers before the browser has a
  // chance to override them with the multipart boundary. Fastify's
  // @fastify/multipart then sees the explicit application/json content
  // type and refuses to parse the body → 400 "No file uploaded". The
  // browser does set the correct Content-Type for FormData bodies in
  // modern fetch, but only when the headers dict doesn't pin it first.
  // Step3Profile works because it doesn't use requestJson.
  const form = new FormData();
  form.append("file", file);
  return fetch("/api/profile/avatar", {
    method: "POST",
    credentials: "include",
    body: form,
  }).then(parseJson<{ avatarUrl: string }>);
}

// ─── Account deletion ────────────────────────────────────────────────

export function deleteAccount(): Promise<{ message: string }> {
  // Bodyless DELETE — must go through requestVoid() (not requestJson())
  // so the Content-Type: application/json header is NOT set on an empty
  // body. Fastify would otherwise return 400 FST_ERR_CTP_EMPTY_JSON_BODY.
  return requestVoid<{ message: string }>("/api/profile", { method: "DELETE" });
}

// ─── 42 OAuth link / unlink ──────────────────────────────────────────

/** Start the link flow. The OAuth 42 callback already handles the link
 *  case when the caller is already authed (see auth.ts:303-315 — it sets
 *  oauth42Id on the current user's row and redirects to /profile?linked=true).
 *  No intent param needed: a plain navigation to /api/auth/42 while authed
 *  triggers the link branch via the existingToken check. */
export function startLinkOAuth42(): string {
  return "/api/auth/42";
}

export function unlinkOAuth42(): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>("/api/auth/oauth42/unlink", {
    method: "POST",
  });
}
