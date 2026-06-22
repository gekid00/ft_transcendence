/**
 * Shared game-state store. Supports both:
 *   1. Anonymous play vs AI (via REST `/api/play/*`)
 *   2. Authenticated play vs AI / multiplayer (via Socket.io)
 *
 * Single source of truth. Subscribe via `useSyncExternalStore` inside components.
 */

import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import {
  startGame,
  makeMove,
  getState,
  type PublicGameView,
  type AiTelemetry,
  PlayApiError,
} from "./play-api";

type Listener = () => void;

function findWinningLine(board: number[][]): Array<[number, number]> | null {
  const rows = board.length;
  const cols = board[0].length;
  const directions: Array<[number, number]> = [
    [0, 1], // horizontal
    [1, 0], // vertical
    [1, 1], // diag down-right
    [1, -1], // diag down-left
  ];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = board[row][col];
      if (cell === 0) continue;
      for (const [dr, dc] of directions) {
        const line: Array<[number, number]> = [[row, col]];
        for (let i = 1; i < 4; i++) {
          const r = row + dr * i;
          const c = col + dc * i;
          if (r < 0 || r >= rows || c < 0 || c >= cols) break;
          if (board[r][c] !== cell) break;
          line.push([r, c]);
        }
        if (line.length === 4) return line;
      }
    }
  }
  return null;
}

/**
 * Apply the player's move to the local view immediately for optimistic UI.
 * Returns null when the move is locally invalid.
 */
/**
 * Apply the player's move to the local view immediately for optimistic UI.
 * Returns null when the move is locally invalid.
 */
function applyPlayerMoveLocally(view: PublicGameView | null, col: number, userSlot: 1 | 2): PublicGameView | null {
  if (!view) return null;
  if (col < 0 || col > 6) return null;
  if (view.status !== "in_progress") return null;
  if (view.currentPlayer !== userSlot) return null;

  let row = -1;
  for (let r = view.board.length - 1; r >= 0; r--) {
    if (view.board[r][col] === 0) {
      row = r;
      break;
    }
  }
  if (row === -1) return null; // column full

  const newBoard = view.board.map((r) => [...r]);
  newBoard[row][col] = userSlot;

  return {
    ...view,
    board: newBoard,
    currentPlayer: userSlot === 1 ? 2 : 1,
  };
}

export interface PlayStoreState {
  gameId: number | null;
  userId: number | null; // The authenticated user ID
  userSlot: 1 | 2;       // Slot 1 (yellow) or Slot 2 (red)
  timerP1: number | null; // User seconds remaining
  timerP2: number | null; // Opponent seconds remaining
  p1Username: string;
  p2Username: string;
  aiDifficulty: "easy" | "medium" | "hard" | null;
  timePerPlayerSeconds: number | null;
  isAiOpponent: boolean;

  /** Latest server snapshot, or null before the first /start round-trip. */
  view: PublicGameView | null;
  /** Latest AI telemetry from the most recent move. */
  telemetry: AiTelemetry | null;
  /** Last AI move (col + row). */
  lastAiMove: { col: number; row: number } | null;
  /** Board state at the time of the last AI response. */
  telemetryBoard: number[][] | null;
  /** Last known AI bestScore — used by the position slider. */
  positionScore: number | null;
  /** True between sending /move and receiving the response. */
  thinking: boolean;
  /** True after the user has dropped their first piece. */
  hasPlayed: boolean;
  /** Set when the current game finishes. null while the game is in progress. */
  gameEndState: "won" | "lost" | "draw" | null;
  /** Computed user score for the just-finished game. */
  gameScore: number | null;
  /** Elo change of the current user for the just-finished game. */
  eloChange: number | null;
  /** Maximum AI search depth seen across all AI moves this game. */
  maxAiDepth: number;
  /** End-game UI phase. */
  endGamePhase: "idle" | "glow" | "status" | "card";
  /** Last error from the API, or null. */
  error: PlayApiError | null;
}

const initialState: PlayStoreState = {
  gameId: null,
  userId: null,
  userSlot: 1,
  timerP1: null,
  timerP2: null,
  p1Username: "You",
  p2Username: "AI",
  aiDifficulty: null,
  timePerPlayerSeconds: null,
  isAiOpponent: true,

  view: null,
  telemetry: null,
  lastAiMove: null,
  telemetryBoard: null,
  positionScore: null,
  thinking: false,
  hasPlayed: false,
  gameEndState: null,
  gameScore: null,
  eloChange: null,
  maxAiDepth: 0,
  endGamePhase: "idle",
  error: null,
};

function computeScore(
  view: PublicGameView,
  maxAiDepth: number,
  outcome: "won" | "lost" | "draw",
): number {
  let moveCount = 0;
  for (const row of view.board) for (const cell of row) if (cell !== 0) moveCount++;
  const outcomeBonus = outcome === "won" ? 500 : outcome === "draw" ? 100 : 0;
  return Math.max(0, 1000 + maxAiDepth * 50 - moveCount * 20 + outcomeBonus);
}

function deriveEndState(view: PublicGameView, userSlot: 1 | 2): "won" | "lost" | "draw" | null {
  if (view.status !== "finished" && view.status !== "abandoned") return null;
  if (view.winner === userSlot) return "won";
  if (view.winner === null) return "draw";
  return "lost";
}

class PlayStore {
  private state: PlayStoreState = initialState;
  private listeners = new Set<Listener>();
  private startPromise: Promise<void> | null = null;
  private endGameTimers: ReturnType<typeof setTimeout>[] = [];

  // Socket properties
  private socket: Socket | null = null;
  private localCountdownInterval: ReturnType<typeof setInterval> | null = null;
  private lastTimerUpdateAt: number | null = null;
  private serverTimerP1: number | null = null;
  private serverTimerP2: number | null = null;

  private scheduleEndGamePhases() {
    this.clearEndGameTimers();
    this.set({ endGamePhase: "glow" });
    this.endGameTimers.push(
      setTimeout(() => this.set({ endGamePhase: "card" }), 1100),
    );
  }

  private clearEndGameTimers() {
    for (const t of this.endGameTimers) clearTimeout(t);
    this.endGameTimers = [];
  }

  getSnapshot = (): PlayStoreState => this.state;

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  private set(patch: Partial<PlayStoreState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }

  /**
   * Connect to Socket.io for authenticated game play
   */
  connectGame = (
    gameId: number,
    opts: {
      userId?: number;
      aiDifficulty?: "easy" | "medium" | "hard";
      timePerPlayerSeconds?: number;
      isAiOpponent?: boolean;
      p1Username?: string;
      p2Username?: string;
    } = {},
  ) => {
    if (typeof window === "undefined") return;

    this.disconnectGame();

    this.lastTimerUpdateAt = Date.now();
    this.serverTimerP1 = opts.timePerPlayerSeconds ?? null;
    this.serverTimerP2 = opts.timePerPlayerSeconds ?? null;

    this.set({
      gameId,
      userId: opts.userId ?? null,
      userSlot: 1,
      view: null,
      telemetry: null,
      lastAiMove: null,
      telemetryBoard: null,
      positionScore: null,
      gameEndState: null,
      gameScore: null,
      maxAiDepth: 0,
      endGamePhase: "idle",
      hasPlayed: false,
      error: null,
      aiDifficulty: opts.aiDifficulty ?? null,
      timePerPlayerSeconds: opts.timePerPlayerSeconds ?? null,
      isAiOpponent: opts.isAiOpponent ?? true,
      p1Username: opts.p1Username ?? "You",
      p2Username: opts.p2Username ?? (opts.isAiOpponent ? "AI" : "Opponent"),
    });

    // Establish WebSocket connection directly to bypass ModSecurity polling blocks
    const socket = io({
      transports: ["websocket"],
    });
    this.socket = socket;

    socket.on("connect", () => {
      socket.emit("game:join", { gameId });
    });

    socket.on("connect_error", (err) => {
      this.set({
        error: new PlayApiError("INTERNAL", `Connection error: ${err.message}`),
      });
    });

    socket.on("game:state", (data: { state: any; aiMove?: { col: number; row: number; telemetry: AiTelemetry }; p1EloChange?: number | null; p2EloChange?: number | null }) => {
      const serverState = data.state;
      if (!serverState) return;

      const isDraw = serverState.status === "finished" && serverState.winner === null;
      const winningLine =
        serverState.status === "finished" && serverState.winner !== null
          ? findWinningLine(serverState.board)
          : null;

      const view: PublicGameView = {
        board: serverState.board,
        currentPlayer: serverState.currentPlayer,
        status: serverState.status,
        winner: serverState.winner,
        isDraw,
        winningLine,
      };

      const userSlot =
        this.state.userId !== null
          ? serverState.players[1] === this.state.userId
            ? 1
            : serverState.players[2] === this.state.userId
            ? 2
            : 1
          : 1;

      const endState = deriveEndState(view, userSlot);
      
      const newMaxDepth = data.aiMove
        ? Math.max(this.state.maxAiDepth, data.aiMove.telemetry.depth)
        : this.state.maxAiDepth;

      const score = endState ? computeScore(view, newMaxDepth, endState) : null;
      const userDelta = userSlot === 1 ? data.p1EloChange : data.p2EloChange;

      const telemetry = data.aiMove 
        ? data.aiMove.telemetry 
        : this.state.telemetry;
      const lastAiMove = data.aiMove 
        ? { col: data.aiMove.col, row: data.aiMove.row } 
        : this.state.lastAiMove;
      const telemetryBoard = data.aiMove 
        ? view.board 
        : this.state.telemetryBoard;
      const positionScore = data.aiMove 
        ? data.aiMove.telemetry.bestScore 
        : this.state.positionScore;

      this.lastTimerUpdateAt = Date.now();
      this.serverTimerP1 = serverState.timerP1;
      this.serverTimerP2 = serverState.timerP2;

      this.set({
        view,
        userSlot,
        timerP1: serverState.timerP1,
        timerP2: serverState.timerP2,
        gameEndState: endState,
        gameScore: score,
        eloChange: userDelta ?? null,
        thinking: view.currentPlayer !== userSlot && view.status === "in_progress",
        telemetry,
        lastAiMove,
        telemetryBoard,
        positionScore,
        maxAiDepth: newMaxDepth,
      });

      if (endState) {
        this.scheduleEndGamePhases();
      }
    });

    socket.on("game:timer", (data: { timerP1: number; timerP2: number }) => {
      this.lastTimerUpdateAt = Date.now();
      this.serverTimerP1 = data.timerP1;
      this.serverTimerP2 = data.timerP2;
      this.set({
        timerP1: data.timerP1,
        timerP2: data.timerP2,
      });
    });

    socket.on("game:over", (data: { winner: 1 | 2 | null; status: string; p1EloChange?: number | null; p2EloChange?: number | null }) => {
      if (!this.state.view) return;

      const view: PublicGameView = {
        ...this.state.view,
        status: data.status as any,
        winner: data.winner,
        isDraw: data.winner === null,
        winningLine:
          data.winner !== null ? findWinningLine(this.state.view.board) : null,
      };

      const endState = deriveEndState(view, this.state.userSlot);
      const score = endState ? computeScore(view, 0, endState) : null;
      const userDelta = this.state.userSlot === 1 ? data.p1EloChange : data.p2EloChange;

      this.set({
        view,
        gameEndState: endState,
        gameScore: score,
        eloChange: userDelta ?? null,
        thinking: false,
      });

      this.scheduleEndGamePhases();
    });

    socket.on("game:error", (data: { error: string }) => {
      this.set({
        error: new PlayApiError("INTERNAL", data.error || "Game error occurred"),
        thinking: false,
      });
    });

    // Start local countdown intervals to make timer visual ticking smooth and sync-safe
    this.localCountdownInterval = setInterval(() => {
      const { view } = this.state;
      if (!view || view.status !== "in_progress" || this.lastTimerUpdateAt === null) return;

      const elapsedSeconds = Math.floor((Date.now() - this.lastTimerUpdateAt) / 1000);

      if (view.currentPlayer === 1 && this.serverTimerP1 !== null) {
        const remaining = Math.max(0, this.serverTimerP1 - elapsedSeconds);
        if (this.state.timerP1 !== remaining) {
          this.set({ timerP1: remaining });
        }
      } else if (view.currentPlayer === 2 && this.serverTimerP2 !== null) {
        const remaining = Math.max(0, this.serverTimerP2 - elapsedSeconds);
        if (this.state.timerP2 !== remaining) {
          this.set({ timerP2: remaining });
        }
      }
    }, 100);
  };

  /**
   * Disconnect WebSocket game play
   */
  disconnectGame = () => {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    if (this.localCountdownInterval) {
      clearInterval(this.localCountdownInterval);
      this.localCountdownInterval = null;
    }
    this.clearEndGameTimers();
  };

  /**
   * Handle resigning
   */
  resign = () => {
    if (this.state.gameId && this.socket) {
      this.socket.emit("game:surrender", { gameId: this.state.gameId });
    }
  };

  ensureStarted = async (): Promise<void> => {
    // If in Socket mode, ensureStarted is managed by connectGame
    if (this.state.gameId !== null) return;

    if (this.state.view) return;
    if (this.startPromise) return this.startPromise;
    this.startPromise = (async () => {
      try {
        const { state } = await startGame();
        this.set({ view: state, telemetry: null, error: null });
      } catch (e) {
        if (e instanceof PlayApiError) this.set({ error: e });
      } finally {
        this.startPromise = null;
      }
    })();
    return this.startPromise;
  };

  restart = async (): Promise<void> => {
    this.clearEndGameTimers();

    // If in socket mode, restart creates a new game vs AI with same settings and redirects
    if (this.state.gameId !== null) {
      if (!this.state.isAiOpponent) {
        window.location.href = "/play";
        return;
      }
      try {
        const res = await fetch("/api/games/ai", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            difficulty: this.state.aiDifficulty || "medium",
            timePerPlayerSeconds: this.state.timePerPlayerSeconds || 180,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          window.location.href = `/play/ai/${data.gameId}`;
        } else {
          window.location.href = "/play";
        }
      } catch (e) {
        window.location.href = "/play";
      }
      return;
    }

    // Anonymous restart
    const prev = this.state.view;
    const emptyBoard: number[][] = Array.from({ length: 6 }, () => Array(7).fill(0));
    this.set({
      view: prev
        ? {
            ...prev,
            board: emptyBoard,
            currentPlayer: 1,
            status: "in_progress",
            winner: null,
            isDraw: false,
            winningLine: null,
          }
        : null,
      telemetry: null,
      lastAiMove: null,
      telemetryBoard: null,
      positionScore: null,
      gameEndState: null,
      gameScore: null,
      maxAiDepth: 0,
      endGamePhase: "idle",
      hasPlayed: false,
      error: null,
    });
    try {
      const { state } = await startGame();
      this.set({ view: state });
    } catch (e) {
      if (e instanceof PlayApiError) this.set({ error: e });
    }
  };

  play = async (col: number): Promise<void> => {
    if (this.state.thinking) return;
    if (col < 0 || col > 6) return;

    if (this.state.view && this.state.view.status !== "in_progress") {
      return;
    }

    // Handle play via Socket.io in authenticated mode
    if (this.state.gameId !== null && this.socket) {
      if (!this.state.view) return;
      const optimistic = applyPlayerMoveLocally(this.state.view, col, this.state.userSlot);
      if (!optimistic) return;

      this.lastTimerUpdateAt = Date.now();
      this.serverTimerP1 = this.state.timerP1;
      this.serverTimerP2 = this.state.timerP2;

      this.set({
        view: optimistic,
        thinking: true,
        error: null,
        hasPlayed: true,
      });

      this.socket.emit("game:move", { gameId: this.state.gameId, col });
      return;
    }

    // Handle play via REST in anonymous mode
    if (!this.state.view) {
      await this.ensureStarted();
      if (!this.state.view) return;
    }

    const optimistic = applyPlayerMoveLocally(this.state.view, col, this.state.userSlot);
    if (!optimistic) return;

    this.set({
      view: optimistic,
      thinking: true,
      error: null,
      hasPlayed: true,
    });

    const PIECE_ANIM_MS = 450;
    const animationFinished = new Promise<void>((resolve) =>
      setTimeout(resolve, PIECE_ANIM_MS),
    );

    try {
      const [res] = await Promise.all([makeMove(col), animationFinished]);
      const newMaxDepth = res.aiMove
        ? Math.max(this.state.maxAiDepth, res.aiMove.telemetry.depth)
        : this.state.maxAiDepth;
      const endState = deriveEndState(res.state, this.state.userSlot);
      const score = endState
        ? computeScore(res.state, newMaxDepth, endState)
        : null;
      this.set({
        view: res.state,
        telemetry: res.aiMove?.telemetry ?? null,
        lastAiMove: res.aiMove ? { col: res.aiMove.col, row: res.aiMove.row } : null,
        telemetryBoard: res.aiMove ? res.state.board : this.state.telemetryBoard,
        positionScore: res.aiMove?.telemetry.bestScore ?? this.state.positionScore,
        maxAiDepth: newMaxDepth,
        gameEndState: endState,
        gameScore: score,
      });
      if (res.aiMove) {
        await new Promise<void>((resolve) => setTimeout(resolve, PIECE_ANIM_MS));
      }
      this.set({ thinking: false });
      if (this.state.gameEndState) {
        this.scheduleEndGamePhases();
      }
    } catch (e) {
      this.set({ thinking: false });
      if (e instanceof PlayApiError) {
        this.set({ error: e });
        if (e.code === "GAME_OVER" || e.code === "NO_SESSION") {
          this.startPromise = null;
          this.set({ view: null });
          await this.ensureStarted();
        } else {
          try {
            const { state } = await getState();
            this.set({ view: state });
          } catch {
            this.startPromise = null;
            this.set({ view: null });
            await this.ensureStarted();
          }
        }
      }
    }
  };
}

export const playStore = new PlayStore();
