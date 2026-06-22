/**
 * Client for the /api/play/* anonymous play endpoints.
 *
 * Game state lives on the server. The client only:
 *   - calls startGame() once on mount to get an initial state + session cookie
 *   - calls makeMove(col) on each user click; the server applies the player
 *     move + AI counter and returns the updated state
 *   - calls reset() to start fresh after a finished game
 *
 * Errors are surfaced as PlayApiError with a typed code so the UI can react
 * (e.g. show a toast on COL_FULL, auto-restart on GAME_OVER). The server
 * follows the same `{ error: <human>, code, status }` shape as the rest of
 * the backend — see apps/server/src/lib/errors.ts.
 *
 * `credentials: "include"` makes the browser send/receive the play_session
 * cookie. The cookie is HttpOnly and not visible to JavaScript — the client
 * just relies on the browser to round-trip it.
 */

export type Cell = 0 | 1 | 2;
export type BoardCells = Cell[][]; // 6×7

export interface PublicGameView {
  board: BoardCells;
  currentPlayer: 1 | 2;
  status: "in_progress" | "finished" | "abandoned";
  winner: 1 | 2 | null;
  isDraw: boolean;
  /** When game is finished with a winner, the [row, col] coords of the
   *  four winning cells. null while in progress or on a draw. */
  winningLine: Array<[number, number]> | null;
}

export interface AiTelemetry {
  depth: number;
  nodesEvaluated: number;
  nodesPerSecond: number;
  evalTimeMs: number;
  bestScore: number;
  columnScores: Array<number | null>;
}

export interface AiMove {
  col: number;
  /** Row where the AI dropped its piece (0 = top, 5 = bottom). */
  row: number;
  telemetry: AiTelemetry;
}

export interface MoveResponse {
  state: PublicGameView;
  /** Present when the AI also moved (i.e. game wasn't over after player). */
  aiMove?: AiMove;
}

export type PlayErrorCode =
  | "INVALID_BODY"
  | "INVALID_COL"
  | "COL_FULL"
  | "NO_SESSION"
  | "NOT_YOUR_TURN"
  | "GAME_OVER"
  | "INTERNAL"
  | "NETWORK";

export class PlayApiError extends Error {
  constructor(
    public readonly code: PlayErrorCode,
    message: string,
    public readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "PlayApiError";
  }
}

const BASE = "/api/play";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    const headers: Record<string, string> = { ...(init.headers as Record<string, string> ?? {}) };
    // Only set Content-Type when there's actually a body — Fastify
    // rejects empty bodies if Content-Type is application/json.
    if (init.body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    res = await fetch(`${BASE}${path}`, {
      ...init,
      credentials: "include",
      headers,
    });
  } catch (e) {
    throw new PlayApiError("NETWORK", e instanceof Error ? e.message : "Network error");
  }

  // Try to parse JSON regardless of status — server returns JSON for errors too.
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const errBody = body as { error?: string; code?: string; status?: number } | null;
    const code = (errBody?.code ?? "INTERNAL") as PlayErrorCode;
    const msg = errBody?.error ?? `Request failed with status ${res.status}`;
    throw new PlayApiError(code, msg, res.status);
  }
  return body as T;
}

export function startGame(): Promise<{ state: PublicGameView }> {
  return request<{ state: PublicGameView }>("/start", { method: "POST" });
}

export function getState(): Promise<{ state: PublicGameView }> {
  return request<{ state: PublicGameView }>("/state", { method: "GET" });
}

export function makeMove(col: number): Promise<MoveResponse> {
  return request<MoveResponse>("/move", {
    method: "POST",
    body: JSON.stringify({ col }),
  });
}

export function resetGame(): Promise<{ state: PublicGameView }> {
  return request<{ state: PublicGameView }>("/reset", { method: "POST" });
}
