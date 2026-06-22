/**
 * AITelemetry — ambient left-column panel showing the AI's "thinking".
 *
 * Renders the static set of widgets from the wireframe:
 *   - 7×6 thinking matrix:
 *       · for each column, the AI's score is rendered as a "ghost piece" at
 *         the column's landing position (the lowest empty cell — exactly
 *         where the next piece would gravity-drop). Best move = darkest.
 *         Non-candidates fade to the base color and disappear into the grid.
 *       · all 42 dots run a continuous left-to-right wave (matrix-pulse) with
 *         200 ms column stagger
 *       · the best-move cell additionally emits a sonar-ping every 5s,
 *         radiating a ring outward like the AI re-asserting its answer
 *   - Evaluation bar (1/3 filled)
 *   - Stats list (Depth / Nodes/sec / Eval Time)
 *   - Value slider (numeric label + horizontal bar + dashed continuation)
 *
 * Once wired to the AI:
 *   - In idle state, both animation layers run as today.
 *   - In `AI THINKING…` state, we'd amp pulse intensity to read as active search.
 *   - On move commit, a one-shot drop animation could play down the chosen
 *     column.
 *
 * TODO(integration): replace placeholders with live telemetry from the AI worker.
 *   - matrix.columnLandingRows: derived from current Board state (lowest empty row per col)
 *   - matrix.columnScores: bind to AI's per-column minimax score (0..1 normalized)
 *   - eval bar: bind `evalRatio` (0..1) to the current minimax score normalized
 *   - stats: bind { depth, nodesPerSec, evalTimeMs } from worker postMessage
 *   - value slider: bind `currentEval` (centipawn-style score) + history dashed line
 *   Hook point: GameDemo island will pass these as props on every search update.
 */

import { useSyncExternalStore } from "react";

import { cn } from "~/lib/utils";
import { playStore } from "~/lib/play-store";
import type { AiTelemetry, PublicGameView } from "~/lib/play-api";

interface AITelemetryProps {
  /**
   * Per-column AI evaluation, length 7, values in [0..1]:
   *   0 = not a candidate (already full / losing line) — fades to base color
   *   1 = best move (darkest)
   * Rendered at each column's landing cell.
   */
  columnScores?: number[];
  /**
   * Per-column landing row index (0=top, 5=bottom). The lowest empty cell of
   * each column on the live board — exactly where the next piece would land
   * if dropped. Use `-1` for full columns (no marker rendered). Length 7.
   */
  columnLandingRows?: number[];
  /** 0..1 ratio for the evaluation bar fill. */
  evalRatio?: number;
  stats?: {
    depth: number;
    nodesPerSec: string;
    evalTimeMs: number;
  };
  /** Value slider score (centipawn-style). */
  evalScore?: number;
  pawnSkin?: string;
}

const ROWS = 6;
const COLS = 7;

/** Stagger between adjacent columns. 7 × 200ms ≈ 1400ms over a 3000ms cycle = continuous wave. */
const COLUMN_STAGGER_MS = 200;

/** Base opacity for non-marker dots (uniform decorative grid). */
const BASE_OPACITY = 0.35;

/** Map a 0..1 column score to opacity in [BASE_OPACITY..1.0]. score 0 blends into the base. */
function scoreOpacity(score: number): number {
  return BASE_OPACITY + Math.max(0, Math.min(1, score)) * (1 - BASE_OPACITY);
}

/** Default state matches the wireframe mid-game: col 3 is the best move. */
const DEFAULT_LANDING_ROWS = [5, 4, 3, 2, 3, 5, 5];
const DEFAULT_COLUMN_SCORES = [0, 0.15, 0.55, 1.0, 0.75, 0.25, 0];

/**
 * Compute the lowest empty row for each column on a live board.
 * Returns -1 for full columns.
 */
function landingRowsFromBoard(board: PublicGameView["board"]): number[] {
  const result: number[] = [];
  for (let c = 0; c < COLS; c++) {
    let row = -1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r][c] === 0) {
        row = r;
        break;
      }
    }
    result.push(row);
  }
  return result;
}

/**
 * Normalize the AI's per-column raw minimax scores to a 0..1 ramp where
 * 1 = best move and 0 = worst (or null/full column). Forced-win scores
 * (≥ 1_000_000) saturate at 1.
 */
function normalizeColumnScores(raw: Array<number | null>): number[] {
  const valid = raw.map((s) => (s === null ? null : s));
  const present = valid.filter((s): s is number => s !== null);
  if (present.length === 0) return Array(COLS).fill(0);

  const max = Math.max(...present);
  const min = Math.min(...present);
  const range = max - min;

  return valid.map((s) => {
    if (s === null) return 0;
    if (range === 0) return 1; // all moves equally good
    return (s - min) / range;
  });
}

function formatNodesPerSec(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

/**
 * Position strength as a 0..1 ratio for the slider.
 *   0   = player has a forced/heavy advantage
 *   0.5 = even
 *   1   = AI has a forced/heavy advantage
 *
 * Robustness measures (vs the naive sigmoid):
 *   - Wide scale (150) so small heuristic scores read as near-even.
 *     A solo +50 score (e.g. center bonus + one open-3) shouldn't slam
 *     the bar to "AI winning" — that's more like "slightly developed".
 *   - Deadband: |score| < DEADBAND treated as exactly 0.5. Avoids the
 *     bar twitching on every move when the position is tactically even.
 *   - Terminal scores still saturate at 0 / 1 immediately.
 */
function positionStrength(bestScore: number): number {
  if (bestScore >= 1_000_000) return 1;
  if (bestScore <= -1_000_000) return 0;
  const DEADBAND = 30;
  if (Math.abs(bestScore) <= DEADBAND) return 0.5;
  // Subtract the deadband so the curve starts at 0.5 right outside it.
  const adjusted = bestScore - Math.sign(bestScore) * DEADBAND;
  const scale = 150;
  return 1 / (1 + Math.exp(-adjusted / scale));
}

export function AITelemetry({
  columnScores,
  columnLandingRows,
  evalRatio,
  stats,
  evalScore,
  pawnSkin = "default",
}: AITelemetryProps) {
  const p1BgClass = "bg-pawn-yellow/40";
  const p2BgClass = "bg-pawn-red/40";
  // Subscribe to the live game store. SSR returns initialState (view=null,
  // telemetry=null) so the component falls back to the wireframe defaults
  // until the first AI move arrives.
  const snap = useSyncExternalStore(
    playStore.subscribe,
    playStore.getSnapshot,
    playStore.getSnapshot,
  );

  // Derive live values from the store. Each derived value is only used if
  // the explicit prop wasn't passed AND the store has data for it. This
  // preserves the styleguide's overridable contract.
  const liveLandingRows: number[] | null = snap.telemetryBoard
    ? landingRowsFromBoard(snap.telemetryBoard as PublicGameView["board"])
    : null;

  // When the AI has played, the live landing rows reflect the board
  // AFTER the AI's drop — so the AI's chosen column shows the row above
  // its piece, which makes the matrix look like it's predicting the AI's
  // NEXT move. We want the matrix anchored to the position the AI was
  // deciding from. Patch the chosen column's landing row back to where
  // the piece actually landed.
  const decisionLandingRows: number[] | null =
    liveLandingRows && snap.lastAiMove
      ? liveLandingRows.map((row, c) =>
          c === snap.lastAiMove!.col ? snap.lastAiMove!.row : row,
        )
      : liveLandingRows;

  const liveColumnScores: number[] | null = snap.telemetry
    ? normalizeColumnScores(snap.telemetry.columnScores)
    : null;

  const liveStats: AITelemetryProps["stats"] | null = snap.telemetry
    ? {
        depth: snap.telemetry.depth,
        nodesPerSec: formatNodesPerSec(snap.telemetry.nodesPerSecond),
        evalTimeMs: Math.round(snap.telemetry.evalTimeMs),
      }
    : null;

  const liveEvalScore: number | null = snap.telemetry
    ? Math.round(Math.max(-999, Math.min(999, snap.telemetry.bestScore)))
    : null;

  // Position strength for the slider — AI's perspective. 0.5 = even,
  // > 0.5 means AI is winning, < 0.5 means YOU are winning.
  // Reads from snap.positionScore (persistent across player moves) rather
  // than snap.telemetry.bestScore (cleared on optimistic update). Keeps
  // the slider at its last known position during AI compute instead of
  // snapping back to center.
  const livePositionRatio: number | null =
    snap.positionScore !== null ? positionStrength(snap.positionScore) : null;

  const finalColumnScores =
    columnScores ?? liveColumnScores ?? new Array(COLS).fill(0);
  // Live mode: only show landing-row markers AFTER the AI has actually
  // evaluated the position (i.e. telemetry exists). Pre-move = empty grid.
  const finalLandingRows =
    columnLandingRows ??
    (snap.telemetry ? decisionLandingRows : null) ??
    new Array(COLS).fill(-1);
  // Stats are blank pre-game (no telemetry yet). Wireframe defaults
  // only used when explicit `stats` prop is passed (styleguide).
  const finalStats =
    stats ?? liveStats ?? null;
  const finalEvalScore = evalScore ?? liveEvalScore ?? null;

  // Best column = the AI's actual chosen move when we have one in store.
  // This is the source of truth for "which move did the AI pick" — falling
  // back to argmax(scores) only for the wireframe default state.
  const bestColumn =
    snap.lastAiMove?.col ?? (Math.max(...finalColumnScores) > 0
      ? finalColumnScores.indexOf(Math.max(...finalColumnScores))
      : -1);

  return (
    <section
      aria-labelledby="ai-telemetry-heading"
      className="flex w-full max-w-[220px] flex-col gap-10 font-mono text-mono-sm text-muted-foreground"
    >
      <h2 id="ai-telemetry-heading" className="sr-only">
        AI telemetry
      </h2>

      {/* Thinking matrix */}
      <div aria-hidden="true">
        <div className="grid w-full grid-cols-7 gap-[18px]">
          {Array.from({ length: ROWS }, (_, r) =>
            Array.from({ length: COLS }, (_, c) => {
              const isLandingCell = finalLandingRows[c] === r;
              const score = isLandingCell ? (finalColumnScores[c] ?? 0) : 0;
              const baseOpacity = isLandingCell ? scoreOpacity(score) : BASE_OPACITY;
              const isBestMove = isLandingCell && c === bestColumn;

              const waveDelay = `${c * COLUMN_STAGGER_MS}ms`;
              // Per-column transition delay so when the AI evaluation
              // updates, the matrix recalibrates as a sweep from left to
              // right rather than a uniform snap. ~60ms × 7 columns =
              // ~420ms between leftmost and rightmost cell starting their
              // transition; combined with the 800ms transition duration
              // each cell takes, the total visual settle is ~1.2s.
              const transitionDelay = `${c * 60}ms`;

              // Static styles. Opacity is no longer set inline — the
              // .matrix-cell CSS rule sets it from --matrix-base-opacity,
              // which transitions smoothly when the AI evaluation
              // changes. The pulse animation only scales, leaving the
              // opacity transition free to run uninterrupted.
              const inlineStyle: React.CSSProperties = {
                transform: "scale(0.92)",
                ["--matrix-base-opacity" as never]: baseOpacity.toFixed(3),
                transitionDelay,
              };
              if (isBestMove) {
                inlineStyle.animation = `matrix-pulse 3s ease-in-out ${waveDelay} infinite, sonar-ping 5s ease-out 0ms infinite`;
              } else {
                inlineStyle.animationDelay = waveDelay;
              }

              return (
                <span
                  key={`${r}-${c}`}
                  className={cn(
                    "matrix-cell size-4 rounded-full",
                    // All landing cells use the dark color so even low-scored
                    // candidates remain visible (opacity does the gradient).
                    isLandingCell ? "bg-foreground" : "bg-muted-foreground",
                    !isBestMove && "animate-matrix-pulse",
                  )}
                  style={inlineStyle}
                />
              );
            }),
          )}
        </div>
      </div>

      {/* Stats — em-dashes pre-game (no telemetry yet), real values
          after each AI move. */}
      <ul className="flex w-full flex-col gap-1 uppercase opacity-70">
        <li>Depth: {finalStats?.depth ?? "—"}</li>
        <li>Nodes/sec: {finalStats?.nodesPerSec ?? "—"}</li>
        <li>Eval Time: {finalStats ? `${finalStats.evalTimeMs}ms` : "—"}</li>
      </ul>

      {/* Position strength — tug-of-war between AI (red, left) and YOU
          (yellow, right). The slider is composed of a flex-1 main bar
          and an 8px small bar (replacing the previous dashed line); the
          two render as one continuous strip thanks to gap-0 + matching
          /20 muted underlay + /40 colored fills. The thumb sits at the
          AI/YOU boundary, computed across the whole slider so it lands
          at the visual center when even.
          When the AI is dominant enough that its territory crosses the
          main-bar boundary (ratio close to 1, e.g. forced win), the
          small bar transitions from yellow to red so we never see a
          stray yellow square while AI is winning everything. */}
      <div className="flex w-full items-center gap-0 pt-2 opacity-70" aria-hidden="true">
        {/* Main bar */}
        <div className="relative h-2 flex-1 bg-muted-foreground/20">
          {(() => {
            const ratio = livePositionRatio ?? 0.5;
            // Approximate fraction of the slider taken by the main bar.
            // Small bar is fixed 8px; main bar is flex-1 (~96% of total
            // for typical 200px+ widths). The exact value isn't critical
            // — it just controls when the small bar starts shifting from
            // yellow to red. 0.96 reads correctly across reasonable
            // slider widths.
            const MAIN_FRACTION = 0.96;
            // Within the main bar's frame, the red fill goes from 0 to
            // (ratio / MAIN_FRACTION) of the main bar (clamped to 100%).
            // Once the global ratio passes MAIN_FRACTION, the main bar
            // is fully red and the small bar starts transitioning.
            const mainRed = Math.min(1, ratio / MAIN_FRACTION) * 100;
            const mainYellow = 100 - mainRed;
            return (
              <>
                <div
                  className={cn("absolute left-0 top-0 h-full transition-[width] duration-500", p2BgClass)}
                  style={{ width: `${mainRed}%` }}
                />
                <div
                  className={cn("absolute right-0 top-0 h-full transition-[width] duration-500", p1BgClass)}
                  style={{ width: `${mainYellow}%` }}
                />
              </>
            );
          })()}
          {/* Thumb at the split point. Positioned across the entire
              slider (main + small) by using calc(ratio% + ratio*8px)
              so ratio=0.5 lands exactly in the visual middle of the
              whole slider. */}
          <div
            className="absolute top-1/2 h-5 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-foreground transition-[left] duration-500"
            style={{
              left: `calc(${(livePositionRatio ?? 0.5) * 100}% + ${(livePositionRatio ?? 0.5) * 8}px)`,
            }}
          />
        </div>
        {/* Small bar — territorial extension of the main bar. When the
            global ratio < MAIN_FRACTION, this stays fully yellow (user's
            territory continues past the main bar). When ratio passes
            MAIN_FRACTION (AI dominant), red bleeds into the small bar
            and yellow recedes. At ratio=1 it's fully red — no stray
            yellow square. */}
        <div className="relative h-2 w-2 bg-muted-foreground/20">
          {(() => {
            const ratio = livePositionRatio ?? 0.5;
            const MAIN_FRACTION = 0.96;
            const SMALL_FRACTION = 1 - MAIN_FRACTION;
            // How much of the small bar is now red (0..1).
            const smallInner = Math.max(0, Math.min(1, (ratio - MAIN_FRACTION) / SMALL_FRACTION));
            const smallRed = smallInner * 100;
            const smallYellow = 100 - smallRed;
            return (
              <>
                <div
                  className={cn("absolute left-0 top-0 h-full transition-[width] duration-500", p2BgClass)}
                  style={{ width: `${smallRed}%` }}
                />
                <div
                  className={cn("absolute right-0 top-0 h-full transition-[width] duration-500", p1BgClass)}
                  style={{ width: `${smallYellow}%` }}
                />
              </>
            );
          })()}
        </div>
      </div>
    </section>
  );
}
