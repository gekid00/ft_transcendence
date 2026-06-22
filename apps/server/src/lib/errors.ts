/**
 * Standardised error response shape. Every error site in the app should
 * go through `sendError()` rather than building a `{ error: "..." }`
 * payload by hand — that way the field semantics stay consistent:
 *
 *   - `error` — human-readable message (English, sentence case). Surfaced
 *     to the user as-is when the client has no opinion.
 *   - `code`  — stable, machine-readable string. Used by the frontend
 *     client to branch on (`code === "WRONG_PASSWORD"` etc.) and
 *     substitute a friendlier translation. The union of valid codes is
 *     exposed as `ApiErrorCode` so the frontend can typecheck against it.
 *   - `status` — HTTP status, set via `reply.code()`. Duplicated as a
 *     field on the body for clients that prefer body-driven branching.
 *
 * Why both `error` AND `code`: until now the backend sent only `error`
 * (a free-form string) and the frontend was treating that string as a
 * code, which meant the typed branch in the UI never matched and the
 * user got the raw `Request failed with status 401` fallback. The fix
 * is structural: server now sends a code, client can branch on it.
 */
import type { FastifyReply } from "fastify";

export type ApiErrorCode =
  // Auth / session
  | "NOT_AUTHED"
  | "INVALID_TOKEN"
  // Profile — generic
  | "INVALID_BODY"
  | "USER_NOT_FOUND"
  | "INVALID_USERNAME"
  | "USERNAME_TAKEN"
  | "BIO_TOO_LONG"
  | "INVALID_SKIN"
  | "INVALID_FILE"
  | "FILE_TOO_LARGE"
  // Profile — email / password
  | "WRONG_PASSWORD"
  | "EMAIL_IN_USE"
  | "PASSWORD_REQUIRED"
  | "PASSWORD_TOO_SHORT"
  | "PASSWORD_SAME_AS_CURRENT"
  // OAuth
  | "OAUTH_NOT_LINKED"
  | "OAUTH_UNLINK_BLOCKED"
  // Anonymous play (/api/play/*)
  | "NO_SESSION"
  | "INVALID_COL"
  | "COL_FULL"
  | "GAME_OVER"
  | "NOT_YOUR_TURN"
  // Catch-all
  | "INTERNAL";

export function sendError(
  reply: FastifyReply,
  status: number,
  code: ApiErrorCode,
  message: string,
): FastifyReply {
  return reply.code(status).send({ error: message, code, status });
}
