/**
 * Leaderboard — right-column ranking list.
 *
 * Default state: 6 entries from the public /api/leaderboard endpoint
 * (top of the global Elo ranking). Progressive opacity from row 1
 * (full) to row 6 (40%).
 *
 * After the user finishes a game, their score (computed in playStore)
 * is inserted as a 7th row at the correct rank position. The user's
 * row is highlighted with an accent border (no opacity reduction) so
 * it stands out among the live entries — making the "this could be
 * you, sign up to keep this rank" pitch implicit.
 *
 * Score range from the formula in play-store.ts:
 *   1000 + maxAiDepth*50 - moveCount*20 + outcomeBonus
 *   - typical wins land around 1500-2200, losses around 800-1400
 *   - live entries are 1654-2854, so most users will land below them
 *     (motivating signup to "climb the board")
 */

import { useEffect, useSyncExternalStore } from "react";

import { cn } from "~/lib/utils";
import { playStore } from "~/lib/play-store";
import {
  leaderboardStore,
  type LeaderboardEntry,
} from "~/lib/leaderboard-store";

interface LeaderboardProps {
  /**
   * Optional override for the entries. Used by /styleguide to inject
   * synthetic data without hitting the API. The default consumes
   * `leaderboardStore`, which fetches /api/leaderboard?limit=6.
   */
  entries?: LeaderboardEntry[];
}

interface DisplayRow extends LeaderboardEntry {
  /** True for the user's row when they've finished a game. Drives the
   *  accent styling so it stands out from the live entries. */
  isUser?: boolean;
}

/**
 * Insert the user's row into the entries list at the correct rank
 * position (sorted by rating desc) and re-number ranks. Caps total
 * length at entries.length + 1.
 */
function withUserRow(
  entries: LeaderboardEntry[],
  userScore: number,
  userWinRate: number,
): DisplayRow[] {
  const userRow: DisplayRow = {
    rank: 0,
    username: "you",
    rating: userScore,
    peakRating: userScore,
    winRate: userWinRate,
    title: "Apprentice",
    isUser: true,
  };

  let insertAt = entries.length;
  for (let i = 0; i < entries.length; i++) {
    if (userScore >= entries[i].rating) {
      insertAt = i;
      break;
    }
  }

  const rows: DisplayRow[] = [...entries];
  rows.splice(insertAt, 0, userRow);
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

export function Leaderboard({ entries }: LeaderboardProps = {}) {
  const snap = useSyncExternalStore(
    playStore.subscribe,
    playStore.getSnapshot,
    playStore.getSnapshot,
  );

  const liveSnap = useSyncExternalStore(
    leaderboardStore.subscribe,
    leaderboardStore.getSnapshot,
    leaderboardStore.getSnapshot,
  );

  // Kick off the fetch on mount if no override was passed. The landing
  // page has a 2.9s page-reveal delay, so the empty state is masked.
  useEffect(() => {
    if (entries !== undefined) return;
    void leaderboardStore.ensureLoaded();
  }, [entries]);

  // Use the prop override when provided (styleguide); otherwise the store.
  const baseEntries: LeaderboardEntry[] =
    entries ?? liveSnap.entries;

  // Once the user has finished a game and the end-game card is showing,
  // inject their row at the correct rank position. Hide before then so
  // the leaderboard stays neutral during play.
  const showUser = snap.endGamePhase === "card" && snap.gameScore !== null;
  // Single-game win rate stand-in: 100 for win, 0 for loss, 50 for draw.
  // It's a one-game sample but matches the wireframe column shape and
  // gives the user something to "improve" once they sign up.
  const userWinRate =
    snap.gameEndState === "won" ? 100 : snap.gameEndState === "draw" ? 50 : 0;
  const rows: DisplayRow[] = showUser
    ? withUserRow(baseEntries, snap.gameScore!, userWinRate)
    : baseEntries.map((e) => ({ ...e, isUser: false }));

  // 6-step opacity gradient (one entry deeper than the original 5 to
  // match the leaderboard endpoint's default limit of 6).
  const ROW_OPACITY = [
    "opacity-100",
    "opacity-80",
    "opacity-60",
    "opacity-50",
    "opacity-40",
    "opacity-30",
  ];

  return (
    <section aria-labelledby="leaderboard-heading" className="flex w-full max-w-[220px] flex-col">
      <h2
        id="leaderboard-heading"
        className="mb-4 font-mono text-mono-sm uppercase text-muted-foreground"
      >
        Leaderboard
      </h2>

      <ol className="flex flex-col gap-3 font-mono text-mono-md">
        {rows.map((entry) => {
          // Static rows preserve the wireframe's progressive fade. The
          // user's row keeps full opacity + a left accent stripe so it
          // stands out without breaking the row alignment.
          const opacityClass = entry.isUser
            ? "opacity-100"
            : ROW_OPACITY[
                rows.filter((r) => !r.isUser).indexOf(entry)
              ] ?? "opacity-30";
          return (
            <li
              key={`${entry.rank}-${entry.username}`}
              className={cn(
                // Bottom border only on non-last rows so the bottom of the
                // list reads cleanly. Tailwind arbitrary variant
                // [&:not(:last-child)] gates both border-b and border-color.
                "relative flex items-center justify-between gap-3 pb-2 text-foreground",
                "[&:not(:last-child)]:border-b [&:not(:last-child)]:border-border",
                opacityClass,
              )}
            >
              {/* User-row accent — absolute-positioned 2px stripe so it
                  doesn't push content right (which would misalign the
                  rank number with the rows above). */}
              {entry.isUser && (
                <span
                  aria-hidden="true"
                  className="absolute -left-2 top-0 bottom-2 w-[2px] bg-foreground"
                />
              )}
              <div className="flex min-w-0 gap-3">
                <span className="font-semibold tabular-nums">{entry.rank}.</span>
                <span
                  className={cn(
                    "truncate font-semibold",
                    entry.isUser && "italic",
                  )}
                >
                  {entry.username}
                </span>
              </div>
              {/* Numeric columns: fixed widths (w- rather than min-w-)
                  so the column boxes are identical across rows. With
                  text-right + tabular-nums the digits land at the same
                  pixel offset whether the number is 4 digits (2854) or
                  the percent is 6 chars ('100.0%'). */}
              <div className="flex shrink-0 gap-3 font-semibold tabular-nums">
                <span className="w-[3.5em] text-right">{entry.rating}{entry.gamesPlayed < 20 ? "?" : ""}</span>
                <span className="w-[3.75em] text-right">{entry.winRate.toFixed(1)}%</span>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
