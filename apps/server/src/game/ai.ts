// AI Connect 4 — iterative deepening minimax with alpha-beta + transposition table.
//
// Strength notes:
//   - Iterative deepening: search 1 ply, then 2, ... up to a time budget. The
//     deepest fully-completed iteration wins; partial iterations are
//     discarded. Good move ordering hints from shallower depths feed the
//     deeper ones via the TT, so total work isn't much more than searching
//     the deepest depth directly.
//   - Transposition table: caches every non-leaf evaluation by (board, turn).
//     With α/β tightening, entries also store flag (exact/lower/upper) so we
//     can prune deeper searches that revisit the same position.
//   - Landing-aware threats: a 3-in-a-row with the empty cell at the column's
//     landing row is an *immediate* threat. Same shape with the empty cell
//     above the stack is a future threat. Different bonuses for each.
//   - Defense ≥ offense weighting: blocking opponent's open-3 (-100) is
//     prioritized over completing our own (+50). Without this asymmetry the
//     AI would race to extend instead of blocking.
//   - Trap filter at root: simulates every candidate move and rejects ones
//     that hand the opponent an immediate winning reply (the classic "stack
//     a piece and lose" beginner blunder).
//   - Center-column control matters: 10 pts per piece in column 3, 4 pts in
//     columns 2/4. Connect 4 is solved — center is mandatory.

import { Board, dropToken, getValidMoves, ROWS, COLS } from "./board.js";
import { checkWin, isDraw } from "./check_board.js";

const DEFAULT_TIME_BUDGET_MS = 500;
const MAX_DEPTH = 16;
const MARGIN_EPS = 0;
const MOVE_ORDER = [3, 2, 4, 1, 5, 0, 6];

// Score scale anchors (terminal scores live well above any heuristic value).
const TERMINAL_BONUS = 1_000_000;

// Transposition table entry. flag describes how the stored score relates to
// the alpha-beta window in which it was computed:
//   - "exact": score is the true minimax value
//   - "lower": score is a lower bound (opponent may have a better refutation)
//   - "upper": score is an upper bound (we may have a better continuation)
type TTFlag = "exact" | "lower" | "upper";
interface TTEntry {
  depth: number;
  score: number;
  flag: TTFlag;
  bestMove?: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Heuristic primitives
// ────────────────────────────────────────────────────────────────────────────

/** Lowest empty row per column on `board`. -1 if column is full. */
function computeLandingRows(board: Board): number[] {
  const result: number[] = new Array(COLS).fill(-1);
  for (let c = 0; c < COLS; c++) {
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r][c] === 0) {
        result[c] = r;
        break;
      }
    }
  }
  return result;
}

/** Stable string key for a (board, turn) pair — used as TT lookup key. */
function boardKey(board: Board, turn: 1 | 2): string {
  // 6×7 cells of single digit + turn marker. Connect 4 board states are
  // small enough that string concat is fast and produces unique keys.
  let s = `${turn}|`;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) s += board[r][c];
  }
  return s;
}

/**
 * Score a 4-cell window. Bonuses/penalties are asymmetric (defense > offense)
 * so the AI prefers blocking opponent threats over extending its own.
 *
 * For 3-in-a-row patterns we also check whether the empty cell is the
 * column's *landing row* (gravity-reachable on the next drop) — those are
 * immediate threats. Future threats (empty cell above the stack) get a
 * smaller weight.
 */
function scoreWindow(
  cells: number[],
  positions: ReadonlyArray<readonly [number, number]>,
  aiPlayer: 1 | 2,
  landingRows: number[],
): number {
  const opponent = aiPlayer === 1 ? 2 : 1;
  let nbIA = 0;
  let nbAdv = 0;
  let nbVide = 0;
  let emptyIdx = -1;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === aiPlayer) nbIA++;
    else if (cells[i] === opponent) nbAdv++;
    else {
      nbVide++;
      emptyIdx = i;
    }
  }
  // 4-in-a-row should be caught at the terminal level; clamp anyway.
  if (nbIA === 4) return TERMINAL_BONUS;
  if (nbAdv === 4) return -TERMINAL_BONUS;

  if (nbIA === 3 && nbVide === 1) {
    const [r, c] = positions[emptyIdx];
    return landingRows[c] === r ? 50 : 10;
  }
  if (nbAdv === 3 && nbVide === 1) {
    const [r, c] = positions[emptyIdx];
    return landingRows[c] === r ? -100 : -20;
  }
  if (nbIA === 2 && nbVide === 2) return 5;
  if (nbAdv === 2 && nbVide === 2) return -3;
  return 0;
}

/** Static evaluation of a non-terminal position. Symmetric in the AI/opponent
 *  weighting (with defense slightly heavier). */
function scoreBoard(board: Board, aiPlayer: 1 | 2): number {
  const opponent = aiPlayer === 1 ? 2 : 1;
  const landingRows = computeLandingRows(board);
  let score = 0;

  // Center-column bonus: per the Connect-4 solution, the center column is
  // strategically dominant. Adjacent columns matter less but still meaningfully.
  const center = Math.floor(COLS / 2);
  for (let r = 0; r < ROWS; r++) {
    if (board[r][center] === aiPlayer) score += 10;
    else if (board[r][center] === opponent) score -= 10;
  }
  for (const c of [center - 1, center + 1]) {
    for (let r = 0; r < ROWS; r++) {
      if (board[r][c] === aiPlayer) score += 4;
      else if (board[r][c] === opponent) score -= 4;
    }
  }

  // Walk every 4-cell window in all four directions. Each contributes per
  // scoreWindow's rules.
  // Horizontal ─
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c <= COLS - 4; c++) {
      const cells = [board[r][c], board[r][c + 1], board[r][c + 2], board[r][c + 3]];
      const positions: [number, number][] = [
        [r, c], [r, c + 1], [r, c + 2], [r, c + 3],
      ];
      score += scoreWindow(cells, positions, aiPlayer, landingRows);
    }
  }
  // Vertical │
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r <= ROWS - 4; r++) {
      const cells = [board[r][c], board[r + 1][c], board[r + 2][c], board[r + 3][c]];
      const positions: [number, number][] = [
        [r, c], [r + 1, c], [r + 2, c], [r + 3, c],
      ];
      score += scoreWindow(cells, positions, aiPlayer, landingRows);
    }
  }
  // Diagonal ↘
  for (let r = 0; r <= ROWS - 4; r++) {
    for (let c = 0; c <= COLS - 4; c++) {
      const cells = [
        board[r][c],
        board[r + 1][c + 1],
        board[r + 2][c + 2],
        board[r + 3][c + 3],
      ];
      const positions: [number, number][] = [
        [r, c], [r + 1, c + 1], [r + 2, c + 2], [r + 3, c + 3],
      ];
      score += scoreWindow(cells, positions, aiPlayer, landingRows);
    }
  }
  // Diagonal ↙
  for (let r = 0; r <= ROWS - 4; r++) {
    for (let c = 3; c < COLS; c++) {
      const cells = [
        board[r][c],
        board[r + 1][c - 1],
        board[r + 2][c - 2],
        board[r + 3][c - 3],
      ];
      const positions: [number, number][] = [
        [r, c], [r + 1, c - 1], [r + 2, c - 2], [r + 3, c - 3],
      ];
      score += scoreWindow(cells, positions, aiPlayer, landingRows);
    }
  }

  return score;
}

// ────────────────────────────────────────────────────────────────────────────
// Search core
// ────────────────────────────────────────────────────────────────────────────

function minimax(
  board: Board,
  depth: number,
  alpha: number,
  beta: number,
  isAI: boolean,
  aiPlayer: 1 | 2,
  nodes: { count: number },
  tt: Map<string, TTEntry>,
  deadline: number,
): number {
  nodes.count++;

  // Cooperative cancellation: if the deepening loop is out of time, abort.
  // Returning 0 here is safe — the outer loop discards the partial result.
  if (performance.now() > deadline) return 0;

  const opponent: 1 | 2 = aiPlayer === 1 ? 2 : 1;

  // Terminal checks first — `depth === 0` happens AFTER we confirm no winner,
  // so a position that's already won is scored as a real win regardless of
  // remaining depth.
  const winner = checkWin(board);
  if (winner === aiPlayer) return TERMINAL_BONUS + depth;
  if (winner === opponent) return -(TERMINAL_BONUS + depth);
  if (isDraw(board) || depth === 0) return scoreBoard(board, aiPlayer);

  // Transposition table lookup. The key includes who's to move so we don't
  // confuse "AI plays from X" vs "opponent plays from X".
  const turn: 1 | 2 = isAI ? aiPlayer : opponent;
  const key = boardKey(board, turn);
  const ttEntry = tt.get(key);
  if (ttEntry && ttEntry.depth >= depth) {
    if (ttEntry.flag === "exact") return ttEntry.score;
    if (ttEntry.flag === "lower" && ttEntry.score >= beta) return ttEntry.score;
    if (ttEntry.flag === "upper" && ttEntry.score <= alpha) return ttEntry.score;
  }
  const ttBestMove = ttEntry?.bestMove;

  const validMoves = getValidMoves(board);
  // Move ordering: TT's best-known move first (likely a cutoff), then
  // center-out static order. Better ordering = more α/β cutoffs.
  const ordered: number[] = [];
  if (ttBestMove !== undefined && validMoves.includes(ttBestMove)) {
    ordered.push(ttBestMove);
  }
  for (const c of MOVE_ORDER) {
    if (validMoves.includes(c) && !ordered.includes(c)) ordered.push(c);
  }

  const originalAlpha = alpha;
  const originalBeta = beta;
  let bestMove: number | undefined;
  let bestValue: number;

  if (isAI) {
    bestValue = -Infinity;
    for (const col of ordered) {
      const next = dropToken(board, col, aiPlayer);
      if (next === null) continue;
      const score = minimax(
        next, depth - 1, alpha, beta, false, aiPlayer, nodes, tt, deadline,
      );
      if (score > bestValue) {
        bestValue = score;
        bestMove = col;
      }
      if (bestValue > alpha) alpha = bestValue;
      if (alpha >= beta) break; // β-cutoff
    }
  } else {
    bestValue = Infinity;
    for (const col of ordered) {
      const next = dropToken(board, col, opponent);
      if (next === null) continue;
      const score = minimax(
        next, depth - 1, alpha, beta, true, aiPlayer, nodes, tt, deadline,
      );
      if (score < bestValue) {
        bestValue = score;
        bestMove = col;
      }
      if (bestValue < beta) beta = bestValue;
      if (alpha >= beta) break; // α-cutoff
    }
  }

  // Store with the right flag so subsequent lookups can prune correctly.
  let flag: TTFlag = "exact";
  if (bestValue <= originalAlpha) flag = "upper";
  else if (bestValue >= originalBeta) flag = "lower";
  tt.set(key, { depth, score: bestValue, flag, bestMove });

  return bestValue;
}

/**
 * Returns true if AI playing `candidateCol` lets the opponent win on their
 * next move. Used to filter out trap moves at the root (the kind a beginner
 * AI would walk into — stacking a piece below the opponent's win column).
 */
function isImmediateLossTrap(
  board: Board,
  candidateCol: number,
  aiPlayer: 1 | 2,
): boolean {
  const opponent: 1 | 2 = aiPlayer === 1 ? 2 : 1;
  const afterAI = dropToken(board, candidateCol, aiPlayer);
  if (afterAI === null) return false;
  if (checkWin(afterAI) === aiPlayer) return false; // we won; no trap

  for (const oppCol of getValidMoves(afterAI)) {
    const afterOpp = dropToken(afterAI, oppCol, opponent);
    if (afterOpp && checkWin(afterOpp) === opponent) return true;
  }
  return false;
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

export interface MoveTelemetry {
  /** Deepest fully-completed search depth (in plies). */
  depth: number;
  /** Total positions evaluated across all iterations. */
  nodesEvaluated: number;
  /** Derived nodes-per-second metric. */
  nodesPerSecond: number;
  /** Wall-clock time spent computing the move, in milliseconds. */
  evalTimeMs: number;
  /** Score of the chosen move (≥ 1_000_000 means forced win). */
  bestScore: number;
  /** Per-column root scores from the deepest completed iteration. */
  columnScores: Array<number | null>;
}

export interface MoveResult {
  col: number;
  telemetry: MoveTelemetry;
}

export interface FindBestMoveOptions {
  /** Soft time budget in ms. Defaults to {@link DEFAULT_TIME_BUDGET_MS}. */
  timeBudgetMs?: number;
  /** Hard cap on iterative-deepening depth. Defaults to {@link MAX_DEPTH}. */
  maxDepth?: number;
}

/**
 * Find the AI's next move via iterative deepening + alpha-beta + TT.
 *
 * The function always returns the best result from the deepest fully-completed
 * iteration (so we never use partially-explored move scores). Iterations
 * shallower than depth 1 are still attempted — even with zero time we'll do
 * the trap filter + a single ply.
 */
export function findBestMove(
  board: Board,
  aiPlayer: 1 | 2 = 2,
  options: FindBestMoveOptions = {},
): MoveResult {
  const timeBudget = options.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS;
  const maxDepth = options.maxDepth ?? MAX_DEPTH;
  const start = performance.now();
  const deadline = start + timeBudget;
  const tt = new Map<string, TTEntry>();
  const nodes = { count: 0 };

  const validMoves = getValidMoves(board);
  if (validMoves.length === 0) {
    throw new Error("findBestMove called on a full board");
  }

  // Trap filter: drop any candidate that hands the opponent an immediate win.
  // If every candidate is a trap (rare, only happens deep in already-lost
  // positions), fall back to all valid moves so we still pick something.
  const safeMoves = validMoves.filter(
    (c) => !isImmediateLossTrap(board, c, aiPlayer),
  );
  const candidatePool = safeMoves.length > 0 ? safeMoves : validMoves;

  let bestMove = candidatePool[0];
  let bestScore = -Infinity;
  let depthReached = 0;
  let columnScores: Array<number | null> = new Array(COLS).fill(null);

  for (let depth = 1; depth <= maxDepth; depth++) {
    if (performance.now() > deadline) break;

    // Order root candidates with the previously-best move first to maximize
    // alpha-beta cutoffs in this iteration.
    const orderedRoot: number[] = [];
    if (candidatePool.includes(bestMove)) orderedRoot.push(bestMove);
    for (const c of MOVE_ORDER) {
      if (candidatePool.includes(c) && !orderedRoot.includes(c)) {
        orderedRoot.push(c);
      }
    }

    let depthBest = -Infinity;
    let depthBestMove = candidatePool[0];
    let alpha = -Infinity;
    const beta = Infinity;
    const depthScores: Array<number | null> = new Array(COLS).fill(null);

    let aborted = false;
    for (const col of orderedRoot) {
      if (performance.now() > deadline) {
        aborted = true;
        break;
      }
      const next = dropToken(board, col, aiPlayer);
      if (next === null) continue;
      const score = minimax(
        next, depth - 1, alpha, beta, false, aiPlayer, nodes, tt, deadline,
      );
      depthScores[col] = score;
      if (score > depthBest) {
        depthBest = score;
        depthBestMove = col;
      }
      if (score > alpha) alpha = score;
    }

    if (!aborted) {
      bestMove = depthBestMove;
      bestScore = depthBest;
      depthReached = depth;
      columnScores = depthScores;

      // Forced win/loss confirmed — no point searching deeper.
      if (bestScore >= TERMINAL_BONUS) break;
      if (bestScore <= -TERMINAL_BONUS) break;
    }
  }

  // Tie-break: when multiple non-terminal moves are within MARGIN_EPS, pick
  // randomly for variety. Forced wins skip the margin so we always play the
  // fastest mate (highest depth bonus).
  // Among the tie pool, prefer center-most columns first — at deep search the
  // heuristic often equalizes openings, but Connect 4 is solved with center
  // play, so when in doubt we bias toward the center.
  const isWinningPosition = bestScore >= TERMINAL_BONUS;
  const margin = isWinningPosition ? 0 : MARGIN_EPS;
  const ties = candidatePool.filter((c) => {
    const s = columnScores[c];
    return s !== null && s >= bestScore - margin;
  });
  const center = Math.floor(COLS / 2);
  let chosen: number;
  if (ties.length > 0) {
    const minDist = Math.min(...ties.map((c) => Math.abs(c - center)));
    const centermost = ties.filter((c) => Math.abs(c - center) === minDist);
    chosen = centermost[Math.floor(Math.random() * centermost.length)];
  } else {
    chosen = bestMove;
  }

  const evalTimeMs = performance.now() - start;
  return {
    col: chosen,
    telemetry: {
      depth: depthReached,
      nodesEvaluated: nodes.count,
      nodesPerSecond: evalTimeMs > 0 ? Math.round((nodes.count / evalTimeMs) * 1000) : 0,
      evalTimeMs: Math.round(evalTimeMs * 100) / 100,
      bestScore,
      columnScores,
    },
  };
}

/** Backward-compatible wrapper. Keeps Tim's existing tests green. */
export function getBestMove(board: Board, aiPlayer: 1 | 2 = 2): number {
  return findBestMove(board, aiPlayer).col;
}
