import { useState, useSyncExternalStore } from "react";
import { playStore } from "~/lib/play-store";
import { cn } from "~/lib/utils";
import { NewGameButton } from "./NewGameButton";

interface RightToolPanelProps {
  difficulty?: string;
  isAi?: boolean;
  opponentName?: string;
  opponentRating?: number | string;
  totalGames?: number;
  currentStreak?: number;
  longestStreak?: number;
  formLast5?: Array<"win" | "loss" | "draw">;
  pawnSkin?: string;
  opponentId?: number | null;
}

export function RightToolPanel({
  difficulty,
  isAi = true,
  opponentName = "Opponent",
  opponentRating = 1000,
  totalGames = 28,
  currentStreak = 3,
  longestStreak = 7,
  formLast5 = ["win", "win", "loss", "win", "win"],
  pawnSkin = "default",
  opponentId = null,
}: RightToolPanelProps) {
  const [isConfirmingResign, setIsConfirmingResign] = useState(false);

  const snap = useSyncExternalStore(
    playStore.subscribe,
    playStore.getSnapshot,
    playStore.getSnapshot,
  );

  const isGameFinished = snap.view
    ? snap.view.status === "finished" || snap.view.status === "abandoned"
    : false;

  const handleResign = () => {
    if (isGameFinished) return;
    playStore.resign();
    setIsConfirmingResign(false);
  };

  const resultDot: Record<string, string> = {
    win: "bg-pawn-yellow",
    loss: "bg-pawn-red",
    draw: "bg-muted-foreground",
    empty: "bg-muted-foreground",
  };

  const paddedForm = [
    ...Array(Math.max(0, 5 - (formLast5?.length ?? 0))).fill("empty"),
    ...(formLast5 || []),
  ].slice(-5);

  const resolvedIsAi = difficulty !== undefined ? isAi : false;

  return (
    <div className="relative flex w-full max-w-[220px] min-h-[340px] flex-col items-center justify-between py-2 text-center font-mono text-mono-sm text-muted-foreground md:pl-6 md:before:absolute md:before:left-0 md:before:top-1/2 md:before:h-2/3 md:before:w-px md:before:-translate-y-1/2 md:before:bg-border md:before:content-['']">
      {!isConfirmingResign ? (
        <>
          {/* Opponent header */}
          <div>
            <p className="font-mono text-mono-md uppercase text-foreground">
              {resolvedIsAi ? `AI · ${difficulty}` : opponentName}
            </p>
            <p className="mt-1 font-mono text-mono-sm uppercase text-muted-foreground tabular-nums">
              {resolvedIsAi ? `${totalGames} games played` : `Rating ${opponentRating}`}
            </p>
          </div>

          {/* Form (last 5) */}
          <div>
            <p className="font-mono text-mono-sm uppercase text-muted-foreground">
              Form · last 5
            </p>
            <ol className="mt-2 flex items-center justify-center gap-2" aria-label={resolvedIsAi ? `Last 5 results vs AI ${difficulty}` : `Last 5 results vs ${opponentName}`}>
              {paddedForm.map((r, idx) => (
                <li
                  key={idx}
                  aria-label={r}
                  className={cn("size-3 rounded-full border border-border", resultDot[r])}
                />
              ))}
            </ol>
          </div>
 
          {/* Current streak */}
          {currentStreak !== undefined && (
            <div>
              <p className="font-mono text-mono-sm uppercase text-muted-foreground">
                Current streak
              </p>
              <p className="mt-1 font-mono text-mono-md uppercase tabular-nums">
                <span className="text-foreground">{currentStreak} W</span>
                <span className="ml-2 text-muted-foreground">· best {longestStreak}</span>
              </p>
            </div>
          )}

          {/* Controls */}
          <div className="flex flex-col items-center gap-3 pt-1">
            <NewGameButton opponentId={opponentId} />
            <button
              type="button"
              onClick={() => {
                if (!isGameFinished) {
                  setIsConfirmingResign(true);
                }
              }}
              disabled={isGameFinished}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full bg-muted px-4 py-1.5 font-mono text-mono-sm uppercase text-muted-foreground focus-visible:outline-none focus-visible:bg-foreground focus-visible:text-background",
                isGameFinished
                  ? "opacity-40 cursor-not-allowed pointer-events-none"
                  : "hover:bg-foreground hover:text-background active:scale-[0.98] cursor-pointer"
              )}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="size-3.5" aria-hidden="true">
                <line x1="4" y1="22" x2="4" y2="15" />
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
              </svg>
              Resign
            </button>
          </div>
        </>
      ) : (
        /* Confirmation Modal Overlay - taking full height of RightToolPanel */
        <div className="absolute inset-y-1 right-1 left-1 md:left-7 flex flex-col items-center justify-center bg-surface rounded-xl border border-border shadow-xl z-10 p-4 text-center">
          <div className="flex flex-col gap-4 items-center">
            <div>
              <h3 className="font-display text-2xl font-light italic text-foreground">
                Resign game?
              </h3>
              <p className="mt-2 font-sans text-xs text-muted-foreground leading-normal">
                Are you sure you want to forfeit? This will count as a loss.
              </p>
            </div>
            <div className="flex flex-col gap-2 w-full max-w-[140px] mt-2">
              <button
                type="button"
                onClick={handleResign}
                className="w-full rounded-full bg-destructive py-1.5 font-mono text-mono-sm uppercase text-destructive-foreground hover:opacity-90 transition-opacity cursor-pointer"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setIsConfirmingResign(false)}
                className="w-full rounded-full bg-muted py-1.5 font-mono text-mono-sm uppercase text-muted-foreground hover:bg-foreground hover:text-background transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
