import { useSyncExternalStore } from "react";
import { playStore } from "~/lib/play-store";
import { cn } from "~/lib/utils";

function formatTime(seconds: number | null): string {
  if (seconds === null || seconds < 0) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

interface PlayerTimerProps {
  pawnSkin?: string;
}

export function PlayerTimer({ pawnSkin = "default" }: PlayerTimerProps) {
  const snap = useSyncExternalStore(
    playStore.subscribe,
    playStore.getSnapshot,
    playStore.getSnapshot,
  );

  const {
    timerP1,
    timerP2,
    view,
    userSlot,
    isAiOpponent,
  } = snap;

  if (snap.gameId === null || !view) {
    return null; // Don't render for anonymous games
  }

  const p1Colors = { bg: "bg-pawn-yellow", text: "text-pawn-yellow" };
  const p2Colors = { bg: "bg-pawn-red", text: "text-pawn-red" };

  const displayNameP1 = userSlot === 1 ? "You" : (isAiOpponent ? "AI" : "Opponent");
  const displayNameP2 = userSlot === 2 ? "You" : (isAiOpponent ? "AI" : "Opponent");

  const p1Active = view.currentPlayer === 1 && view.status === "in_progress";
  const p2Active = view.currentPlayer === 2 && view.status === "in_progress";

  return (
    <div className="page-reveal mb-6 w-full max-w-[320px] sm:max-w-[480px] flex items-center justify-between px-2 font-mono">
      <div className={cn("flex items-center gap-2.5 flex-1 transition-opacity duration-200", !p1Active && "opacity-50")}>
        <span className={cn("size-2.5 rounded-full", p1Colors.bg, p1Active && "animate-pulse")} />
        <span className="font-bold uppercase tracking-wider text-mono-xs">{displayNameP1}</span>
        <span className={cn("text-mono-md font-semibold ml-auto tabular-nums", p1Active && p1Colors.text)}>
          {formatTime(timerP1)}
        </span>
      </div>
      <div className="h-4 w-px bg-border/40 mx-4" />
      <div className={cn("flex items-center gap-2.5 flex-1 transition-opacity duration-200 justify-end", !p2Active && "opacity-50")}>
        <span className={cn("text-mono-md font-semibold mr-auto tabular-nums", p2Active && p2Colors.text)}>
          {formatTime(timerP2)}
        </span>
        <span className="font-bold uppercase tracking-wider text-mono-xs">{displayNameP2}</span>
        <span className={cn("size-2.5 rounded-full", p2Colors.bg, p2Active && "animate-pulse")} />
      </div>
    </div>
  );
}
