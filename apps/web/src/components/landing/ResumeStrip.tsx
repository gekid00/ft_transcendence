import React, { useEffect, useState, useRef } from "react";
import { cn } from "~/lib/utils";

interface ActiveGame {
  id: number;
  yourTurn: boolean;
  moves: number;
  timerP1: number;
  timerP2: number;
  userSlot: 1 | 2;
  timeControl: "Bullet" | "Blitz" | "Daily";
  opponent: {
    username: string;
    initial: string;
    rating: number | null;
    isAi: boolean;
    aiDifficulty?: "easy" | "medium" | "hard";
    gamesPlayed?: number;
  };
  secondsLeft: number;
  isLost: boolean;
  lostAnimationStarted?: boolean;
}

export function ResumeStrip() {
  const [games, setGames] = useState<ActiveGame[]>([]);
  const [loading, setLoading] = useState(true);
  const timeoutsRef = useRef<Map<number, ReturnType<typeof setTimeout>[]>>(new Map());

  useEffect(() => {
    return () => {
      for (const list of timeoutsRef.current.values()) {
        list.forEach(clearTimeout);
      }
    };
  }, []);

  const fetchActiveGames = async () => {
    try {
      const res = await fetch("/api/games/active");
      if (res.ok) {
        const data = await res.json();
        setGames((prevGames) => {
          // 1. Map new games from data
          const updatedGames = data.map((newGame: any) => {
            const initialSeconds = newGame.yourTurn
              ? (newGame.userSlot === 1 ? newGame.timerP1 : newGame.timerP2)
              : (newGame.userSlot === 1 ? newGame.timerP2 : newGame.timerP1);
            
            const existing = prevGames.find((g) => g.id === newGame.id);
            if (existing && existing.isLost) {
              return existing;
            }
            
            return {
              ...newGame,
              secondsLeft: initialSeconds,
              isLost: initialSeconds <= 0,
            };
          });

          // 2. Keep missing games (which finished server-side) and mark them as lost
          const missingGames = prevGames.filter(
            (pg) => !data.some((ng: any) => ng.id === pg.id)
          ).map((pg) => {
            if (pg.isLost) return pg;
            return {
              ...pg,
              secondsLeft: 0,
              isLost: true,
            };
          });

          return [...updatedGames, ...missingGames];
        });
      }
    } catch (e) {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActiveGames();
    const syncInterval = setInterval(fetchActiveGames, 10_000);
    return () => clearInterval(syncInterval);
  }, []);

  useEffect(() => {
    const clockInterval = setInterval(() => {
      setGames((prevGames) => {
        return prevGames.map((game) => {
          if (game.isLost) return game;
          
          const newSeconds = Math.max(0, game.secondsLeft - 1);
          const isLost = newSeconds <= 0;
          
          return {
            ...game,
            secondsLeft: newSeconds,
            isLost,
          };
        });
      });
    }, 1000);
    
    return () => clearInterval(clockInterval);
  }, []);

  useEffect(() => {
    const lostGames = games.filter((g) => g.isLost && g.lostAnimationStarted === undefined);

    lostGames.forEach((lostGame) => {
      // Mark as scheduled (false) immediately so we don't schedule multiple times
      setGames((prev) =>
        prev.map((g) => (g.id === lostGame.id ? { ...g, lostAnimationStarted: false } : g))
      );

      const delayTimeout = setTimeout(() => {
        // Start the disappearing transition after 3 seconds
        setGames((prev) =>
          prev.map((g) => (g.id === lostGame.id ? { ...g, lostAnimationStarted: true } : g))
        );

        const removeTimeout = setTimeout(() => {
          // Remove game from state after 500ms transition finishes
          setGames((prev) => prev.filter((g) => g.id !== lostGame.id));
        }, 500);

        const list = timeoutsRef.current.get(lostGame.id) || [];
        list.push(removeTimeout);
        timeoutsRef.current.set(lostGame.id, list);
      }, 3000);

      const list = timeoutsRef.current.get(lostGame.id) || [];
      list.push(delayTimeout);
      timeoutsRef.current.set(lostGame.id, list);
    });
  }, [games]);

  const formatClock = (seconds: number) => {
    if (seconds <= 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  if (loading) {
    return (
      <section
        aria-label="Active games"
        className="rounded-xl border border-border bg-surface text-surface-foreground page-reveal mt-gutter p-5"
        style={{ ["--reveal-delay" as any]: "0.1s" }}
      >
        <header className="flex items-baseline justify-between gap-3">
          <h2 className="font-mono text-mono-md uppercase text-foreground">
            Resume
          </h2>
          <p className="font-mono text-mono-sm uppercase text-muted-foreground tabular-nums">
            Loading...
          </p>
        </header>
      </section>
    );
  }

  return (
    <section
      aria-label="Active games"
      className="rounded-xl border border-border bg-surface text-surface-foreground page-reveal mt-gutter p-5"
      style={{ ["--reveal-delay" as any]: "0.1s" }}
    >
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="font-mono text-mono-md uppercase text-foreground">
          Resume
        </h2>
        <p className="font-mono text-mono-sm uppercase text-muted-foreground tabular-nums">
          {games.length} active
        </p>
      </header>

      <div
        id="resume-placeholder"
        className={cn(
          "flex flex-col items-center gap-2 text-center transition-all duration-700 ease-in-out overflow-hidden",
          games.length === 0
            ? "opacity-100 max-h-[200px] py-6 mt-5 translate-y-0"
            : "opacity-0 max-h-0 py-0 mt-0 translate-y-4 pointer-events-none"
        )}
      >
        <p className="font-display italic text-2xl text-muted-foreground">
          No active games.
        </p>
        <p className="font-mono text-mono-sm uppercase text-muted-foreground">
          Start one with the cards above.
        </p>
      </div>

      {games.length > 0 && (
        <ul className="mt-5 flex flex-col gap-3">
          {games.map((g) => {
            const displayClock = g.isLost ? "GAME OVER" : formatClock(g.secondsLeft);
            const statusText = g.isLost ? "Lost" : g.yourTurn ? "Your turn" : "Waiting";

            return (
              <li
                key={g.id}
                className={cn(
                  "transition-all duration-500 ease-in-out",
                  g.lostAnimationStarted ? "opacity-0 scale-95 max-h-0 overflow-hidden py-0 my-0 border-0" : "opacity-100"
                )}
              >
                <a
                  href={`/play/${g.opponent.isAi ? "ai" : "m"}/${g.id}`}
                  className={cn(
                    "group flex items-center justify-between gap-3",
                    "rounded-lg border border-border bg-muted px-4 py-3",
                    "transition-colors hover:border-foreground hover:bg-surface",
                    g.isLost && "pointer-events-none opacity-80"
                  )}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-surface font-display italic text-base text-foreground"
                    >
                      {g.opponent.initial}
                    </span>
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-sans text-sm font-semibold text-foreground">
                        vs {g.opponent.username}
                        {g.opponent.rating !== null && (
                          <span className="ml-1 font-mono text-mono-sm tabular-nums text-muted-foreground">
                            ({g.opponent.rating}{!g.opponent.isAi && g.opponent.gamesPlayed !== undefined && g.opponent.gamesPlayed < 20 ? "?" : ""})
                          </span>
                        )}
                      </span>
                      <span className="font-mono text-mono-sm uppercase text-muted-foreground">
                        {g.timeControl} · Move {g.moves}
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                    <span
                      className={cn(
                        "font-mono text-mono-sm uppercase",
                        g.isLost
                          ? "text-destructive"
                          : g.yourTurn
                          ? "text-accent"
                          : "text-muted-foreground"
                      )}
                    >
                      {statusText}
                    </span>
                    <span className="font-mono text-mono-md tabular-nums text-foreground">
                      {displayClock}
                    </span>
                  </div>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
