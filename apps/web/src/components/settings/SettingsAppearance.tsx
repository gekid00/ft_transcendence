/**
 * SettingsAppearance — Appearance card of the /settings page.
 *
 * Sections (top to bottom):
 *   1. Theme          Light / Dark / Auto. Drives <html> class +
 *                     localStorage "theme" key via window.__4thewinSetTheme
 *                     (defined inline in RootLayout.astro to share code
 *                     with the TopNav toggle button).
 *   2. Grid skin      Auto-save on change, PUT /api/profile { gridSkin }.
 *   3. Board variant  Frontend-only. No schema column yet — persists to
 *                     localStorage. Backend support deferred to a
 *                     follow-up workstream (see HANDOFF).
 *
 * All three sections are independent — a failed grid-skin save doesn't
 * block theme toggling. Status indicators are inline so each section
 * reads on its own.
 */

import { useEffect, useState, useTransition } from "react";
import { AlertBox } from "~/components/ui/alert-box";
import { cn } from "~/lib/utils";
import {
  ProfileApiError,
  updateProfile,
  type ProfileMe,
} from "~/lib/api/profile";

type Theme = "light" | "dark" | "auto";
type Status = "idle" | "saving" | "saved" | "error";

// Backend allow-list. Mirrored in apps/server/src/routes/users.ts:33-34
// and Step3Profile.tsx — if you add a skin there, add it here too.
const PAWN_SKINS = [
  { id: "default", label: "Classic (Red & Yellow)", swatchClass: "bg-gradient-to-r from-pawn-red to-pawn-yellow" },
  { id: "sunset",  label: "Sunset Glow (Orange & Teal)", swatchClass: "bg-gradient-to-r from-pawn-sunset-p1 to-pawn-sunset-p2" },
  { id: "royal",   label: "Royal Velvet (Indigo & Amber)", swatchClass: "bg-gradient-to-r from-pawn-royal-p1 to-pawn-royal-p2" },
  { id: "forest",  label: "Forest Mint (Emerald & Rose)", swatchClass: "bg-gradient-to-r from-pawn-forest-p1 to-pawn-forest-p2" },
] as const;

const GRID_SKINS = [
  { id: "liquid-glass", label: "Liquid glass", swatchClass: "bg-sky-200 dark:bg-sky-900" },
  { id: "frosted-obsidian", label: "Frosted Obsidian", swatchClass: "bg-stone-800 dark:bg-stone-950 border border-white/10" },
] as const;

const THEME_OPTIONS: { id: Theme; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark",  label: "Dark"  },
  { id: "auto",  label: "Auto"  },
];

const PILL_CLS =
  "px-3 py-1 rounded-full font-mono text-mono-sm uppercase border border-border bg-muted text-muted-foreground transition-colors hover:border-foreground hover:bg-foreground/20 hover:text-foreground data-[state=checked]:border-foreground data-[state=checked]:bg-foreground data-[state=checked]:text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground";

interface SettingsAppearanceProps {
  initial: ProfileMe;
}

export function SettingsAppearance({ initial }: SettingsAppearanceProps) {
  const [gridSkin, setGridSkin] = useState<string>(initial.gridSkin);
  const [gridStatus, setGridStatus] = useState<Status>("idle");
  const [gridError, setGridError] = useState<string | null>(null);
  const [, startGridTransition] = useTransition();

  const [pawnSkin, setPawnSkin] = useState<string>(initial.pawnSkin);
  const [pawnStatus, setPawnStatus] = useState<Status>("idle");
  const [pawnError, setPawnError] = useState<string | null>(null);
  const [, startPawnTransition] = useTransition();

  return (
    <section
      aria-labelledby="settings-appearance-heading"
      className={cn("rounded-xl border border-border bg-surface text-surface-foreground", "page-reveal p-6 md:p-8")}
      style={{ "--reveal-delay": "0.1s" } as React.CSSProperties}
    >
      <h2 id="settings-appearance-heading" className="font-mono text-mono-md uppercase text-foreground">
        Appearance
      </h2>

      <div className="mt-6 flex flex-col gap-6">
        <ThemeBlock />
        <GridSkinBlock
          value={gridSkin}
          onChange={(next) => {
            const prev = gridSkin;
            setGridSkin(next); // optimistic
            setGridStatus("saving");
            setGridError(null);
            startGridTransition(async () => {
              try {
                await updateProfile({ gridSkin: next });
                setGridStatus("saved");
                setTimeout(() => setGridStatus("idle"), 1500);
              } catch (e) {
                setGridSkin(prev);
                setGridStatus("error");
                setGridError(
                  e instanceof ProfileApiError ? e.message : "Save failed",
                );
              }
            });
          }}
          status={gridStatus}
          error={gridError}
        />
        <PawnSkinBlock
          value={pawnSkin}
          onChange={(next) => {
            const prev = pawnSkin;
            setPawnSkin(next); // optimistic
            document.documentElement.setAttribute("data-pawn-skin", next);
            setPawnStatus("saving");
            setPawnError(null);
            startPawnTransition(async () => {
              try {
                await updateProfile({ pawnSkin: next });
                setPawnStatus("saved");
                setTimeout(() => setPawnStatus("idle"), 1500);
              } catch (e) {
                setPawnSkin(prev);
                document.documentElement.setAttribute("data-pawn-skin", prev);
                setPawnStatus("error");
                setPawnError(
                  e instanceof ProfileApiError ? e.message : "Save failed",
                );
              }
            });
          }}
          status={pawnStatus}
          error={pawnError}
        />
      </div>
    </section>
  );
}

// ─── Theme ────────────────────────────────────────────────────────────

function ThemeBlock() {
  const [theme, setThemeState] = useState<Theme>("auto");

  useEffect(() => {
    function onThemeChange() {
      const get = (window as unknown as { __4thewinGetTheme?: () => string })
        .__4thewinGetTheme;
      if (!get) return;
      const next = get() as Theme;
      setThemeState((prev) => (prev === next ? prev : next));
    }

    onThemeChange();

    window.addEventListener("themechange", onThemeChange);
    return () => window.removeEventListener("themechange", onThemeChange);
  }, []);

  function pickTheme(next: Theme) {
    setThemeState(next);
    const set = (window as unknown as { __4thewinSetTheme?: (t: Theme) => void })
      .__4thewinSetTheme;
    if (set) set(next);
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="font-mono text-mono-sm uppercase text-muted-foreground">Theme</p>
      <ul role="radiogroup" aria-label="Theme" className="flex flex-wrap gap-2">
        {THEME_OPTIONS.map((opt) => (
          <li key={opt.id}>
            <button
              type="button"
              role="radio"
              aria-checked={theme === opt.id ? "true" : "false"}
              data-state={theme === opt.id ? "checked" : "unchecked"}
              onClick={() => pickTheme(opt.id)}
              className={PILL_CLS}
            >
              {opt.label}
            </button>
          </li>
        ))}
      </ul>
      <p className="font-mono text-mono-sm uppercase text-muted-foreground">
        Auto follows your system preference
      </p>
    </div>
  );
}

// ─── Grid skin (auto-save) ────────────────────────────────────────────

function GridSkinBlock({
  value,
  onChange,
  status,
  error,
}: {
  value: string;
  onChange: (next: string) => void;
  status: Status;
  error: string | null;
}) {
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-6">
      <p className="font-mono text-mono-sm uppercase text-muted-foreground">Grid skin</p>
      <p className="font-sans text-sm text-muted-foreground">
        Visual theme of the Connect 4 playing grid.
      </p>
      <ul role="radiogroup" aria-label="Grid skin" className="mt-1 flex flex-wrap gap-2">
        {GRID_SKINS.map((opt) => (
          <li key={opt.id}>
            <button
              type="button"
              role="radio"
              aria-checked={value === opt.id ? "true" : "false"}
              data-state={value === opt.id ? "checked" : "unchecked"}
              onClick={() => value !== opt.id && onChange(opt.id)}
              className={cn(
                PILL_CLS,
                "inline-flex items-center gap-2",
              )}
            >
              <span
                aria-hidden="true"
                className={cn("inline-block size-3 shrink-0 rounded-full", opt.swatchClass)}
              />
              {opt.label}
            </button>
          </li>
        ))}
      </ul>
      {status === "error" ? <AlertBox>{error ?? "Save failed"}</AlertBox> : null}
    </div>
  );
}

// ─── Pawn skin (auto-save) ────────────────────────────────────────────

function PawnSkinBlock({
  value,
  onChange,
  status,
  error,
}: {
  value: string;
  onChange: (next: string) => void;
  status: Status;
  error: string | null;
}) {
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-6">
      <p className="font-mono text-mono-sm uppercase text-muted-foreground">Pawn skin</p>
      <p className="font-sans text-sm text-muted-foreground">
        Your in-game piece set on the board.
      </p>
      <ul role="radiogroup" aria-label="Pawn skin" className="mt-1 flex flex-wrap gap-2">
        {PAWN_SKINS.map((skin) => (
          <li key={skin.id}>
            <button
              type="button"
              role="radio"
              aria-checked={value === skin.id ? "true" : "false"}
              aria-label={skin.label}
              title={skin.label}
              data-state={value === skin.id ? "checked" : "unchecked"}
              onClick={() => value !== skin.id && onChange(skin.id)}
              className={cn(
                PILL_CLS,
                "inline-flex items-center gap-2",
              )}
            >
              <span
                aria-hidden="true"
                className={cn("inline-block size-3 shrink-0 rounded-full", skin.swatchClass)}
              />
              {skin.label}
            </button>
          </li>
        ))}
      </ul>
      {status === "error" ? <AlertBox>{error ?? "Save failed"}</AlertBox> : null}
    </div>
  );
}


