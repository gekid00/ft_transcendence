import { playStore } from "~/lib/play-store";

interface NewGameButtonProps {
  opponentId?: number | null;
}

export function NewGameButton({ opponentId }: NewGameButtonProps) {
  const handleNewGame = async () => {
    if (opponentId) {
      playStore.resign();
      // Allow a brief delay for the websocket surrender packet to exit the browser
      await new Promise((resolve) => setTimeout(resolve, 250));
      window.location.href = `/chat?user=${opponentId}&challenge=true`;
    } else {
      void playStore.restart();
    }
  };

  return (
    <button
      type="button"
      onClick={handleNewGame}
      className="inline-flex items-center gap-1.5 rounded-full bg-muted px-4 py-1.5 font-mono text-mono-sm uppercase text-muted-foreground hover:bg-foreground hover:text-background active:scale-[0.98] focus-visible:outline-none focus-visible:bg-foreground focus-visible:text-background cursor-pointer"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-3.5" aria-hidden="true">
        <polyline points="1 4 1 10 7 10" />
        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
      </svg>
      New game
    </button>
  );
}
