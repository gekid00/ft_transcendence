// /api/play/* — server-authoritative anonymous Connect 4 vs AI.
//
// SECURITY MODEL
//   - Game state lives only on the server. The client only ever sends a
//     column index (0..6). The server applies the player's move, runs the
//     AI, and returns a sanitized snapshot.
//   - Session is identified by an HttpOnly cookie (`play_session`) so the
//     value is unreadable / untamperable from client JavaScript.
//   - The cookie value is an opaque server-generated token. It maps to a
//     game in the in-memory store; the client never sees the mapping.
//   - No DB persistence — anonymous play is intentionally ephemeral. TTL
//     cleanup evicts idle games after IDLE_TTL_MS.
//
// ERROR CODES (returned as JSON { error: "<human>", code: "<code>", status }):
//   400 INVALID_BODY   — body missing or malformed
//   400 INVALID_COL    — col is not an integer 0..6
//   400 COL_FULL       — column is already full
//   401 NO_SESSION     — no session cookie or session expired/unknown
//   410 GAME_OVER      — game has finished, call /start to begin a new one
//   410 NOT_YOUR_TURN  — client sent a move while AI was computing
//   500 INTERNAL       — anything else (logged server-side)

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { randomBytes } from "node:crypto";
import { GameState } from "../game/gameState.js";
import { findBestMove, type MoveTelemetry } from "../game/ai.js";
import { findWinningLine } from "../game/check_board.js";
import { sendError } from "../lib/errors.js";

const COOKIE_NAME = "play_session";
const COOKIE_MAX_AGE_S = 60 * 60 * 24; // 24h browser-side
const IDLE_TTL_MS = 30 * 60 * 1000;    // 30min server-side, slid on activity
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

interface SessionEntry {
  state: GameState;
  /** Last time the session sent a request — used for idle-TTL eviction. */
  lastActivityMs: number;
}

const sessions = new Map<string, SessionEntry>();

// Periodic GC of idle sessions. Single timer for the whole process.
let cleanupTimer: NodeJS.Timeout | null = null;
function ensureCleanupRunning() {
  if (cleanupTimer !== null) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [token, entry] of sessions) {
      if (now - entry.lastActivityMs > IDLE_TTL_MS) sessions.delete(token);
    }
  }, CLEANUP_INTERVAL_MS);
  cleanupTimer.unref?.();
}

function newSessionToken(): string {
  return randomBytes(24).toString("hex"); // 48 hex chars
}

function setSessionCookie(reply: FastifyReply, token: string) {
  reply.setCookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_S,
  });
}

/** What the client gets back. Internal player IDs are hidden — client only
 *  needs to know whose turn it is and the board layout. */
interface PublicGameView {
  /** 6 rows × 7 cols, 0=empty, 1=player (you), 2=AI. */
  board: number[][];
  /** Whose turn it is now: 1 = your turn, 2 = AI computing. */
  currentPlayer: 1 | 2;
  /** "in_progress" | "finished" | "abandoned". */
  status: "in_progress" | "finished" | "abandoned";
  /** Winner: 1 (you), 2 (AI), or null (in-progress / draw). */
  winner: 1 | 2 | null;
  /** True when the board is full and no winner. */
  isDraw: boolean;
  /** When the game is finished with a winner, the four [row, col] cells
   *  forming the 4-in-a-row. Used by the frontend to highlight the
   *  winning line. null when the game is in progress or ended in a draw. */
  winningLine: Array<[number, number]> | null;
}

function publicView(state: GameState): PublicGameView {
  const snap = state.getState();
  return {
    board: snap.board,
    currentPlayer: snap.currentPlayer,
    status: snap.status,
    winner: snap.winner,
    isDraw: snap.status === "finished" && snap.winner === null,
    winningLine:
      snap.status === "finished" && snap.winner !== null
        ? findWinningLine(snap.board)
        : null,
  };
}

/** Read the session cookie and return its entry. Touches lastActivityMs.
 *  Returns null if the cookie is missing or doesn't map to anything. */
function getActiveSession(request: FastifyRequest): SessionEntry | null {
  const token = request.cookies[COOKIE_NAME];
  if (!token) return null;
  const entry = sessions.get(token);
  if (!entry) return null;
  entry.lastActivityMs = Date.now();
  return entry;
}

export async function playRoutes(app: FastifyInstance) {
  ensureCleanupRunning();

  // POST /api/play/start — begin a new game (or restart if session has one).
  // Always responds 200 with the initial public state and refreshes the cookie.
  app.post("/play/start", async (request, reply) => {
    const existingToken = request.cookies[COOKIE_NAME];
    const token = existingToken ?? newSessionToken();

    // Player is 1 (anon user 0), AI is 2 (null userId in GameState).
    const state = new GameState({ 1: 0, 2: null });
    sessions.set(token, { state, lastActivityMs: Date.now() });

    setSessionCookie(reply, token);
    return reply.send({ state: publicView(state) });
  });

  // GET /api/play/state — return the current public state for the session.
  app.get("/play/state", async (request, reply) => {
    const entry = getActiveSession(request);
    if (!entry) return sendError(reply, 401, "NO_SESSION", "No active game session.");
    return reply.send({ state: publicView(entry.state) });
  });

  // POST /api/play/move — apply player move, then AI move.
  // Body: { col: 0..6 }
  // Response on success: { state, aiMove?, telemetry? }
  app.post("/play/move", async (request, reply) => {
    const entry = getActiveSession(request);
    if (!entry) return sendError(reply, 401, "NO_SESSION", "No active game session.");

    const body = request.body as { col?: unknown } | undefined;
    if (!body || typeof body !== "object") {
      return sendError(reply, 400, "INVALID_BODY", "Body must be { col: number }.");
    }
    const col = body.col;
    if (typeof col !== "number" || !Number.isInteger(col) || col < 0 || col > 6) {
      return sendError(reply, 400, "INVALID_COL", "col must be an integer 0..6.");
    }

    if (entry.state.getState().status !== "in_progress") {
      return sendError(reply, 410, "GAME_OVER", "Game is finished. POST /play/start to begin a new one.");
    }
    if (entry.state.getState().currentPlayer !== 1) {
      // Defensive — shouldn't happen via normal flow, but possible if a
      // client sends two move requests in flight. Reject the second.
      return sendError(reply, 410, "NOT_YOUR_TURN", "Not your turn. AI move pending.");
    }

    // Apply player move. Returns false if the column is full.
    const playerOk = entry.state.makeMove(col);
    if (!playerOk) {
      return sendError(reply, 400, "COL_FULL", "Column is full.");
    }

    // If the player's move ended the game, we're done.
    if (entry.state.getState().status === "finished") {
      return reply.send({ state: publicView(entry.state) });
    }

    // Otherwise AI plays. AI is player 2.
    let aiMove: { col: number; row: number; telemetry: MoveTelemetry } | null = null;
    try {
      const result = findBestMove(entry.state.getState().board, 2);
      // Capture landing row BEFORE applying — that's where the piece will sit.
      const boardBefore = entry.state.getState().board;
      let landingRow = -1;
      for (let r = boardBefore.length - 1; r >= 0; r--) {
        if (boardBefore[r][result.col] === 0) {
          landingRow = r;
          break;
        }
      }
      aiMove = { col: result.col, row: landingRow, telemetry: result.telemetry };
      const aiOk = entry.state.makeMove(result.col);
      if (!aiOk) {
        // Should be impossible — findBestMove only returns valid columns.
        request.log.error({ col: result.col }, "AI returned an invalid move");
        return sendError(reply, 500, "INTERNAL", "AI returned an invalid move.");
      }
    } catch (e) {
      request.log.error({ err: e }, "AI computation failed");
      return sendError(reply, 500, "INTERNAL", "AI computation failed.");
    }

    return reply.send({
      state: publicView(entry.state),
      aiMove: { col: aiMove.col, row: aiMove.row, telemetry: aiMove.telemetry },
    });
  });

  // POST /api/play/reset — same effect as /start, kept for clarity.
  app.post("/play/reset", async (request, reply) => {
    const existingToken = request.cookies[COOKIE_NAME];
    const token = existingToken ?? newSessionToken();
    const state = new GameState({ 1: 0, 2: null });
    sessions.set(token, { state, lastActivityMs: Date.now() });
    setSessionCookie(reply, token);
    return reply.send({ state: publicView(state) });
  });
}
