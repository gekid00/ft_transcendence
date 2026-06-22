# 4thewin — `apps/web`

The frontend for **4thewin**, the 42 group project's Connect 4 + AI platform.
This package owns the public landing page, design system, and (eventually) all
authenticated app screens. Backend lives in [`../server`](../server/), AI logic
will land in `../server/src/game/` (Tim's scope).

## Stack

| Layer | Tool | Why |
|---|---|---|
| Framework | **Astro 6** (SSR via `@astrojs/node`) | Static-by-default, opt-in React islands, ships less JS than a full SPA |
| UI | **React 19** | Used as Astro islands for interactive bits |
| Styling | **Tailwind CSS v4** (CSS-first `@theme`) | All design tokens live in `src/styles/globals.css` |
| Primitives | **shadcn/ui** | Drop-in components keyed against our token contract |
| Icons | **lucide-react** | Used by shadcn primitives + ThemeToggle |
| Fonts | **Fraunces** (display) / **Public Sans** (body) / **JetBrains Mono** (HUD) | Self-hosted via `@fontsource-variable/*` |
| TypeScript | non-strict | per `CLAUDE.md` decision |

## Dev commands

All commands run from the repo root. They use pnpm workspaces.

```sh
# Install all workspace deps (do this once after clone)
pnpm install

# Dev server with HMR — http://localhost:4321
pnpm dev:web                       # ← shortcut for `pnpm --filter web dev`

# Production build (SSR, output → apps/web/dist/)
pnpm build:web

# Preview the production build
pnpm --filter web preview
```

> **Heads-up about `pnpm dev`.** The plain root `pnpm dev` runs `pnpm --parallel dev`,
> which fans out to **both** `apps/server` and `apps/web`. The server crashes
> immediately if `apps/server/.env` is missing (it's gitignored; copy
> `apps/server/.env.example` and fill in real values to use it). When the
> server crashes, pnpm's parallel runner kills the web dev server too. If you
> only want the frontend, use `pnpm dev:web`. If you want both but tolerate
> server failures, use `pnpm dev:nofail`.

If `pnpm install` ever complains about an unexpected store version, prefix
with `CI=true` to let it auto-purge `node_modules` non-interactively.

## Project structure

```
apps/web/
├── components.json                 # shadcn config (token-aware)
├── astro.config.mjs                # SSR + React + Tailwind v4 vite plugin
├── public/
│   └── favicon.svg                 # Fraunces "4" glyph, dark-mode aware
└── src/
    ├── pages/
    │   ├── index.astro             # Landing page composition
    │   └── test.astro              # Dev-only token + type scale preview
    ├── layouts/
    │   └── RootLayout.astro        # html shell, theme bootstrap, OG, nav, footer
    ├── components/
    │   ├── TopNav.astro            # Floating pill (server-rendered)
    │   ├── ThemeToggle.tsx         # Theme switcher (client:only="react")
    │   ├── Headline.astro          # Game-state kicker (h2, aria-live)
    │   ├── Board.tsx               # 7×6 Connect 4 board (SSR-only today)
    │   ├── AITelemetry.tsx         # Left-column ambient panel
    │   ├── Leaderboard.tsx         # Right-column rankings + "your spot"
    │   ├── SiteFooter.astro        # Wordmark + nav links
    │   └── ui/
    │       └── button.tsx          # shadcn Button + brand-filled / brand-outline variants
    ├── lib/
    │   └── utils.ts                # cn() = clsx + tailwind-merge
    └── styles/
        └── globals.css             # Tailwind v4 @theme contract (~18 tokens)
```

## Design system

### Tokens (`src/styles/globals.css`)

The `@theme` block defines all design tokens. Each `--color-*` / `--font-*` /
`--text-*` / `--spacing-*` / `--radius-*` token automatically generates the
matching Tailwind utility class.

| Group | Tokens |
|---|---|
| Foundation | `background`, `foreground`, `surface`, `surface-foreground`, `muted`, `muted-foreground` |
| Action | `primary`, `primary-foreground`, `secondary`, `secondary-foreground`, `accent`, `accent-foreground`, `destructive`, `destructive-foreground` |
| Form / borders | `border`, `input`, `ring` |
| Game (custom) | `board`, `board-cell`, `pawn-red`, `pawn-yellow` |
| shadcn aliases | `card` / `popover` (and their foregrounds) → resolve to `surface` |

Dark-mode overrides live in a `.dark { … }` block right after `@theme`. Pawn
pieces additionally carry a glow `box-shadow` in dark mode via the `pawn-red`
and `pawn-yellow` `@utility` definitions.

### Typography

| Class | Size / line-height | Family | Use |
|---|---|---|---|
| `text-display` | 120/100 | Fraunces | Large hero (rare) |
| `text-display-mobile` | 64/56 | Fraunces | Mobile hero |
| `text-4xl` / `text-3xl` | 48/52 / 32/36 | Fraunces | Headlines (incl. `Headline.astro`) |
| `text-base` | 16/24 | Public Sans | Body |
| `text-metric` | 24/24, w600 | Public Sans | Telemetry numbers |
| `text-mono-md` | 13/20, 0.05em | JetBrains Mono | Leaderboard rows |
| `text-mono-sm` | 11/16, 0.1em | JetBrains Mono | HUD micro-labels |

### Theme system

Class-based dark mode (`@custom-variant dark`).

The bootstrap script in `RootLayout.astro` is `is:inline`, so it runs
**synchronously before the browser paints**. It reads `localStorage.theme`
first, falls back to `prefers-color-scheme`, and writes either `light` or
`dark` to `<html>`. No flash on reload.

`ThemeToggle.tsx` is `client:only="react"` — never SSR'd, so there's no
hydration mismatch from reading `document` in its initializer. When the user
hasn't explicitly toggled, the toggle follows OS preference live via a
`matchMedia('(prefers-color-scheme: dark)')` listener.

## Integration boundaries

The landing page renders today as **a static showcase** of the eventual product.
There's exactly **one React island** in the SSR'd HTML (`ThemeToggle`); every
other component is server-rendered and ships zero JS.

When game logic (Tim) and backend wiring (auth, leaderboard) lands, search for
`TODO(integration)` in `apps/web/src/` to find every hook point. Current
inventory:

| File | What's stubbed | Hook point |
|---|---|---|
| `pages/index.astro` | The whole landing as composition | Wrap `<AITelemetry/>`, `<Board/>`, `<Leaderboard/>` inside a single `<GameDemo client:load>` island that owns shared state and emits `game:finished` |
| `components/Board.tsx` | Static mid-game position; no clicks | Add `onColumnClick` / `onColumnHover` props; CSS-only drop animation; pass live `pieces` |
| `components/AITelemetry.tsx` | Hardcoded depth / nodes/sec / eval time / matrix lit | Bind to AI worker `postMessage` updates |
| `components/Leaderboard.tsx` | 5 hardcoded `MOCK_ENTRIES`; dashed "your spot" slot | `GET /api/leaderboard`; replace dashed slot with real row + `/signup` CTA on `game:finished` |
| `components/Headline.astro` | Renders `state="your-turn"` only | Subscribe to game state machine; cycles through 6 states |
| `components/TopNav.astro` | Login + Sign up `<a>` tags point to `/login` `/signup` (404 today) | Wire to `apps/server` auth: `POST /api/auth/login`, `POST /api/auth/signup`, OAuth at `GET /api/auth/42` |
| `components/TopNav.astro` | Hamburger button is inert | Replace with shadcn `DropdownMenu` once menu items are defined |
| `components/SiteFooter.astro` | 4 placeholder links → 404 | Build `/about`, `/how-to-play`, `/privacy`, `/terms` pages |

Run `grep -rE 'TODO\(integration\)\|data-todo-integration' apps/web/src` to
list these from the command line.

## Accessibility

Already in place:

- Skip-to-content link (`focus:not-sr-only` in `RootLayout`)
- Heading hierarchy: 1 `<h1>` (sr-only brand statement), 3 `<h2>` (sections)
- Landmarks: `<header>`, `<main>`, `<nav>`, `<footer>`, 2 `<section>`
- `<Headline>` is `role="status"` + `aria-live="polite"` for game-state announcements
- Every interactive element has `aria-label` or visible text
- Decorative SVGs are `aria-hidden="true"`
- Visible focus rings via `--ring` token (custom outline rule in `@layer base`)
- Tabular numerals on every mono context (leaderboard, telemetry) so column
  values align under each other

## Adding shadcn primitives later

`components.json` is configured. To add a primitive:

```sh
pnpm --filter web dlx shadcn@latest add dialog
```

It'll land in `src/components/ui/` and import `~/lib/utils` for `cn()`. The
component will key against our existing tokens (no zinc default).

Keep the **brand-filled** and **brand-outline** Button variants — those
implement the wireframe's "filled-↔-outlined hover dance" used by the nav
CTAs. Don't lose them in a future shadcn upgrade.

## Routes

| Path | Purpose |
|---|---|
| `/` | Landing page |
| `/test` | Dev-only token + type scale preview (do not link from production nav) |
| `/login`, `/signup`, `/about`, `/how-to-play`, `/privacy`, `/terms` | TBD — currently 404 |

## License

Internal — 42 student project, see repo root for license terms.
