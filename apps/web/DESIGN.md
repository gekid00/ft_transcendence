# 4thewin — Design system

Reference for tokens, components, and patterns. Live preview at **`/styleguide`**.

> If this document and the styleguide page disagree, the styleguide is right (it renders production code). Open a PR to fix this doc.

## Table of contents

| § | Section |
|---|---|
| 0  | [How to use this document](#0-how-to-use-this-document) |
| 1  | [Foundations](#1-foundations) — color, typography, spacing, motion |
| 2  | [Primitives](#2-primitives) — Button, Input, FormField, Label, AlertBox |
| 3  | [Patterns](#3-patterns) — form, card, pawn utilities |
| 4  | [Layout](#4-layout) — page shell, landing grid, signup card |
| 5  | [Domain components](#5-domain-components) — landing, signup, auth |
| 6  | [Animation system](#6-animation-system) |
| 7  | [Backend integration boundaries](#7-backend-integration-boundaries) |
| 8  | [Locked decisions](#8-locked-decisions) |
| 9  | [Anti-patterns we explicitly rolled back](#9-anti-patterns-we-explicitly-rolled-back) |
| 10 | [Frontend lessons learned](#10-frontend-lessons-learned) |
| 11 | [Conventions](#11-conventions) |
| 12 | [What's NOT in the system](#12-whats-not-in-the-system) |

---

## 0. How to use this document

- **Looking for a visual?** Open `/styleguide`. Every token, primitive, and pattern is rendered there with all states.
- **Looking for the canonical name of a token?** §1.
- **Looking for a primitive's API?** §2.
- **Looking for why something is the way it is?** §8 (Locked decisions) and §9 (Anti-patterns).
- **Adding a new component?** §11 has the conventions. Update §2/§3 in the same PR.
- **Adding a new color/font/animation?** §1 must be updated AND `/styleguide` should auto-show it (verify by hitting `/styleguide`).

This document is the **what + why**. The **how** lives in code.

---

## 1. Foundations

Tokens defined in `apps/web/src/styles/globals.css` `@theme` block. shadcn-canonical aliases (`--card`, `--popover`, `--card-foreground`, `--popover-foreground`) point to `--surface` so primitives drop in unmodified.

### 1.1 Color tokens

**Light mode defaults** in the `@theme` block; `.dark { … }` overrides them per-token.

| Token | Light OKLCH | Dark OKLCH | Role |
|---|---|---|---|
| `background` | `95.5% 0.012 85` | `15% 0 0` | page bg (linen / deep ink) |
| `foreground` | `28% 0.03 250` | `96% 0 0` | primary text (slate / near-white) |
| `surface` | `100% 0 0` | `20% 0 0` | raised cards, modals |
| `muted` | `91% 0.012 85` | `24% 0 0` | subtle bg fills (nav pill, inputs) |
| `muted-foreground` | `35% 0.04 25` | `70% 0.01 250` | secondary text |
| `border` | `53% 0.04 25` | `100% 0 0 / 0.15` | hairline strokes |
| `accent` | `48% 0.20 25` | `63% 0.21 25` | brand crimson — focus, links, CTAs |
| `destructive` | `50% 0.21 28` | `50% 0.21 28` | error states only |
| `ring` | same as accent | same as accent | focus rings |
| `emphasis` | `15% 0.04 250` | `=foreground` | scannable inline links (Sign in / Sign up cross-links) |
| `pawn-red` | `42% 0.19 25` | `63% 0.21 25` | brand pawn |
| `pawn-yellow` | `73% 0.16 72` | `76% 0.16 85` | AI pawn |
| `pawn-wine` | `35% 0.14 15` | `50% 0.15 15` | skin choice |
| `pawn-coral` | `58% 0.18 30` | `68% 0.18 30` | skin choice |
| `pawn-brick` | `45% 0.12 40` | `55% 0.13 40` | skin choice |
| `grid-linen` | `=background` | `=surface` | default playing surface |
| `grid-ink` | `28% 0.03 250` | `12% 0 0` | dark playing surface |
| `grid-slate` | `48% 0.04 240` | `40% 0.04 240` | mid-tone playing surface |
| `board` | `56% 0.02 80` | `28% 0 0` | sandstone plate |
| `board-cell` | `85% 0.01 85` | `18% 0 0` | empty slot |

### 1.2 Hue families (intent map)

- **Warm-red family** (hue 22–28): `accent`, `destructive`, `border`, `muted-foreground`, `pawn-red`, `pawn-coral`, `pawn-brick`. Brand-coherent spine.
- **Amber family** (hue 72): `pawn-yellow` alone — the only yellow on the page.
- **Linen / cream family** (hue 80–85): `background`, `board-cell`, `board`.
- **Cool slate** (hue 240–250): `foreground`, `emphasis`, `grid-ink`, `grid-slate`. Deliberate cool counterpoint.

### 1.3 Typography

Display: **Fraunces** (variable, italic-forward). Body: **Public Sans**. Mono: **JetBrains Mono** (slashed zero, ligatures).

Custom `--text-*` tokens emit Tailwind utilities:

| Class | Size / leading | Tracking | Weight | Family | Use |
|---|---|---|---|---|---|
| `text-display` | 120 / 100 | -0.04em | 800 | Fraunces | Big hero (rare) |
| `text-display-mobile` | 64 / 56 | -0.04em | 800 | Fraunces | Mobile hero |
| `text-3xl` / `text-4xl` | tw defaults | — | — | Fraunces | Headlines |
| `text-base` | 16 / 24 | — | 400 | Public Sans | Body |
| `text-metric` | 24 / 24 | -0.01em | 600 | Public Sans | Telemetry numbers |
| `text-mono-md` | 13 / 20 | 0.05em | 500 | JBM | Leaderboard rows |
| `text-mono-sm` | 11 / 16 | 0.1em | 500 | JBM | Micro-labels |

**`tailwind-merge` extension** (`apps/web/src/lib/utils.ts`): the custom `text-*` tokens above are registered as font-size utilities. Without this, twMerge classifies them as text-color and silently drops conflicting `text-{color}` classes — invisible text on filled buttons. **If you add a new `--text-*` token, update the `cn()` extension list.**

### 1.4 Spacing tokens

- `--spacing-margin-mobile` (24 px) and `--spacing-margin-desktop` (64 px) — page-level horizontal padding via `px-margin-mobile md:px-margin-desktop`.
- Standard Tailwind scale otherwise.

### 1.5 Motion / animations

Token-driven via `--animate-*` + `@keyframes`:

- **`signup-token-drop`**: 360 ms `cubic-bezier(0.22, 1, 0.36, 1)`. Token slides into its slot on mount.
- **`signup-line-draw`**: `scaleX(0) → scaleX(1)` on the `data-current="4"` connecting beam.
- **`signup-token-flash`**: scale pulse on all four tokens at the win sequence.
- **`matrix-pulse`**: column-staggered wave on AI telemetry. **Keyframe 0% must match the cell's static state** — see §10.
- **`sonar-ping`**: best-move cell radiates a soft ring every 5 s.

Anti-flicker rule: when an element animates from a `disabled→enabled` or static→animating transition, the keyframe `0%` should match the element's static styles (otherwise the first frame jumps visibly).

### 1.6 Custom utilities (game-piece visuals)

`@utility` blocks in `globals.css`:

| Utility | Recipe | Use |
|---|---|---|
| `pawn-red` | `bg-pawn-red` + dome insets + drop shadow + dark-mode glow | brand pawn (lit) |
| `pawn-yellow` | same recipe with amber bg | AI pawn |
| `pawn-neutral` | `bg-foreground` + same dome recipe (flat in dark) | progress dot when filled |
| `pawn-slot` | `bg-muted` + **inverted** insets (top-dark, bottom-light) | empty slot (board hole effect) |

**Bare `bg-pawn-*` token classes** apply just the color (no dome) — used for flat color previews like the skin picker swatches.

---

## 2. Primitives

Lives in `apps/web/src/components/ui/`. shadcn-canonical API (`variant + size + asChild + className`). React 19 — refs are regular props.

### 2.1 `<Button>` — `components/ui/button.tsx`

Extended with 4thewin brand variants.

| Variant | Use |
|---|---|
| `default` / `destructive` / `outline` / `secondary` / `ghost` / `link` | shadcn defaults |
| `brand-filled` | dark filled CTA, **inverts to outlined on hover**. Use for nav CTAs (Sign up, Play). |
| `brand-outline` | outlined CTA, **inverts to filled on hover**. Use for secondary nav (Login). |

| Size | Dimensions |
|---|---|
| `default` / `sm` / `lg` / `icon` | shadcn defaults |
| `pill` | `h-9 px-5 rounded-full font-mono text-mono-sm uppercase` — nav pill |

**Form-submit override** (see §10.4 for why): brand-filled buttons used as form submits should override the hover inversion with `className="hover:bg-foreground/90 hover:text-background"`. The inversion is jarring on retry-after-failure when the cursor is still over the button as it transitions disabled→enabled.

### 2.2 `<Input>` — `components/ui/input.tsx`

shadcn primitive, token-keyed. `aria-invalid` drives the error border + ring (red).

Focus ring is `ring-foreground` (neutral slate), NOT `ring-ring` (brand crimson) — see §9 for why.

### 2.3 `<Label>` — `components/ui/label.tsx`

shadcn primitive. `htmlFor` required for accessibility. Use with `<Input id={…}>`.

### 2.4 `<FormField>` — `components/ui/form-field.tsx`

Composes Label + Input + optional helper/error message with aria wiring.

```tsx
<FormField
  id="email"
  label="Email"
  type="email"
  required
  value={email}
  onChange={(e) => setEmail(e.target.value)}
  hint="We'll never share this."     // shown when no error
  error={touched && !valid ? "Use a valid email." : null}
/>
```

The `error` prop, when set, replaces `hint`, sets `aria-invalid={true}`, wires `aria-describedby`, and renders the message in destructive color with `role="alert"`.

**For password fields with reveal toggles, file inputs, or textareas**: compose Label + Input directly. FormField is for simple text-style fields.

### 2.5 `<AlertBox>` — `components/ui/alert-box.tsx`

Form-level alert with optional inline action link.

```tsx
<AlertBox>Wrong email or password.</AlertBox>

<AlertBox action={{ label: "Sign in instead?", href: "/login" }}>
  Couldn't create your account.
</AlertBox>

<AlertBox variant="info">Heads up — read-only until verified.</AlertBox>
```

| Variant | Color | Role |
|---|---|---|
| `error` (default) | `text-destructive` | `role="alert"` (announced) |
| `info` | `text-muted-foreground` | none (visual only) |

The action link inherits the alert's text color, bold-underlined, hover dims via opacity.

---

## 3. Patterns

### 3.1 Form layout

Single-column flex stack with `gap-6` between fields, `gap-2` inside each field (label → input → hint/error).

```tsx
<form className="flex flex-col gap-6">
  <header className="flex flex-col gap-4">…</header>
  <FormField id="email" label="Email" … />
  <FormField id="password" label="Password" … />     // or composed if reveal/etc.
  {error ? <AlertBox>…</AlertBox> : null}
  <Button type="submit" variant="brand-filled" size="pill" className="hover:bg-foreground/90 hover:text-background">
    Sign in →
  </Button>
</form>
```

Submit button text is **constant**, not swapped to `"Signing in…"` on submit (text-content swaps flicker). Disabled-state fade plus form-level error/redirect are sufficient pending feedback.

### 3.2 Focused-card composition

Used by `/login` and `/signup` (via `SignupShell`). Card: `rounded-xl border border-border bg-surface p-6 shadow-sm md:p-8`. Centered in `max-w-md` mobile, `max-w-md md:max-w-3xl` for content-heavy steps (Step 3).

### 3.3 Sign-in / Sign-up cross-link

Outside the card, muted-mono context, with one bold emphasized link:

```html
<p class="text-center font-mono text-mono-sm uppercase text-muted-foreground">
  Already have an account?
  <a class="font-bold text-emphasis underline underline-offset-4 transition-opacity hover:opacity-70 focus-visible:opacity-70" href="/login">
    Sign in
  </a>
</p>
```

Mirror on `/login`: "Don't have an account? Sign up" — same styling.

### 3.4 Pawn utilities for visual depth

For actual game pieces, use `pawn-red` / `pawn-yellow` / `pawn-neutral` (utility, applies dome+drop). For flat color previews (skin pickers), use `bg-pawn-red` (auto-generated token class, just bg-color).

---

## 4. Layout

### 4.1 Page shell — `RootLayout.astro`

```
<body class="flex min-h-svh flex-col">
  [skip-to-content link]
  <TopNav authed={authed} />        ← floating pill, fixed top-6
  <div class="flex-1"><slot /></div>
  <SiteFooter />
</body>
```

`min-h-svh` + `flex-1` keeps the footer at the bottom on short pages. `getCurrentUser(Astro)` runs once per request to pick the TopNav variant.

### 4.2 Landing grid — `/`

12-col grid at md+: AITelemetry (3) / Headline+Board (6) / Leaderboard (3). `gap-gutter`, `items-start` so columns share the board top baseline. Headline is hoisted ABOVE the grid and centered.

Side panels share **184 px content width** for visual symmetry — matrix dimensions, eval bar, and slider all hit 184 px exactly. **If matrix dimensions change, all three width tokens update together** (commented in `AITelemetry.tsx`).

Mobile: panels stack via `order-N md:order-N` classes.

### 4.3 Signup card — `SignupShell`

`max-w-md` for steps 1, 2, 4. `max-w-md md:max-w-3xl` for step 3 (wider to fit the 2-column profile form). `pt-32 pb-4` vertical padding so card clears the floating pill nav.

`SignupProgress` tracker sits ABOVE the card (outside the card padding) so the step-4 connect animation has room.

### 4.4 Mobile reflow

- Floating pill nav stays sticky-fixed on all viewports.
- Multi-column desktop layouts collapse to single-column at default (`md:` adds the columns).
- Form gaps are kept loose on mobile (`gap-6`, `pt-4` between legend and swatches in step 3) — touch targets need air.

---

## 5. Domain components

### 5.1 Landing — `components/landing/`

| Component | Role |
|---|---|
| `Headline.astro` | game-state kicker above the board |
| `Board.tsx` | live Connect-4 board, subscribes to `playStore`. Renders the optimistic player piece + AI's reply, applies winning-line glow |
| `AITelemetry.tsx` | left panel — 7×6 matrix anchored to the AI's last decision, depth/nodes/eval-time stats, and the AI-vs-YOU position slider (sigmoid-mapped from `bestScore`) |
| `Leaderboard.tsx` | right panel — 5 mock rows + the user's row injected at its computed rank when the end-game card shows. Subtle 2 px left-edge accent on the user row |
| `EndGameOverlay.tsx` | post-game phase orchestration: glow → card. Card spans the board area on desktop, overflows on mobile. Hides the signup CTA when the user is already authenticated |

Supporting libs in `apps/web/src/lib/`:

| File | Role |
|---|---|
| `play-api.ts` | typed fetch client for `/api/play/*` (start, move, state, reset). HttpOnly cookie session — `credentials: "include"` |
| `play-store.ts` | external store (`useSyncExternalStore`) for game state. Owns the optimistic player update, `endGamePhase` timing, score formula, and the "no auto-restart" rule |

### 5.2 Signup — `components/signup/`

| Component | Role |
|---|---|
| `SignupShell.astro` | RootLayout + SignupProgress + card |
| `SignupProgress.tsx` | 4-token tracker, win-line at step 4 |
| `Step1Save.astro` | save-your-spot CTA + carry-over copy |
| `Step2Credentials.tsx` | email + username + password form |
| `Step3Profile.tsx` | avatar + bio + pawn/grid skin pickers |
| `Step4Welcome.astro` | welcome + Play CTA |
| `SignupCompleteTracker.tsx` | fires `POST /api/auth/signup-complete` on step 4 mount |

### 5.3 Auth — `components/auth/`

| Component | Role |
|---|---|
| `LoginForm.tsx` | email + password sign-in form |

### 5.4 Why some are React and some are Astro

Astro by default. React island only when needed: form state, transitions, drag-drop, anything with non-trivial interaction. The auth-checked TopNav pure-SSR; the theme toggle is inline JS, not React (see §10.1 for why).

---

## 6. Animation system

See §1.5 for the keyframe + token list.

### Active animations

- **Hero intro**: per-word slide-and-blur reveal (`hero-word-reveal`, `--i` stagger), then `hero-exit` fades+drifts the headline up at 2.3 s. Plays once per visitor — gated by `localStorage["hero-seen"]`. Reduced-motion: skipped entirely.
- **Page reveal**: `page-reveal` (opacity 0.001 → 0.999 + translateY 20 → 0) on board + side panels, staggered via `--reveal-delay`. Anti-flicker rationale in the keyframe comment.
- **Landing telemetry**: `matrix-pulse` (column-staggered scale wave, opacity-free) + `sonar-ping` (best-move cell, 5 s). Per-cell opacity is driven by a registered `--matrix-base-opacity` `@property` so it crossfades smoothly between AI evaluations (700 ms ease-in-out, 60 ms per-column transition delay).
- **Signup progress**: `signup-token-drop` on the active step's token; at step 4, `signup-line-draw` (the connect-4 beam) → `signup-token-flash` (all four pulse).
- **Game piece drop** (`Board.tsx`): `piece-drop` is a 3-segment cubic-bezier translateY fall + small overshoot+settle, driven by an inline `--drop-start` matching each piece's landing row. Liquid-glass variant uses `piece-drop` on the under-glass color blob and `piece-fade-in` on the on-top sharp circle (so during the fall you see only the refracted tint, the crisp circle materializes at landing).
- **Winning line**: `winning-pulse` is a subtle scale (1 → 1.05) + drop-shadow pulse (oklch pawn color at /0.55 alpha, 5 px blur, 1.6 s). Per-pawn-variant `--winning-glow` color; dark-mode overrides match the existing pawn-glow tokens.
- **End-game overlay**: `endgame-card` (fade + scale 0.94 → 1 over 500 ms) + `endgame-blur` (3 px filter on the board behind the card, 500 ms transition). Phases scheduled by `playStore`: `glow` → `card` at 1100 ms.

### Roadmap (intent — not yet built)

- AI "thinking" state intensifies the telemetry wave (faster, bigger eval-bar fluctuation).

### Animations explicitly avoided

- Page transitions / cinematic crossfades (cheap-feeling for an interactive product).
- Scroll-triggered animation (the page fits one screen).
- Stats-synced animation on landing — premature optimization, wait for AI module.

---

## 7. Backend integration boundaries

The frontend talks to the backend through `/api/*` (proxied to Fastify by ModSec in production, by Vite in `make dev`). Currently wired:

| Endpoint | Status |
|---|---|
| `POST /api/auth/signup` | ✅ Step 2 |
| `POST /api/auth/login` | ✅ LoginForm |
| `POST /api/auth/logout` | ✅ Redirects on HTML Accept, returns JSON on script Accept |
| `POST /api/auth/oauth42/unlink` | ✅ Unlinks 42 account in SettingsAccount |
| `GET  /api/auth/me` | ✅ used by `getCurrentUser()` |
| `POST /api/auth/signup-complete` | ✅ fired by `SignupCompleteTracker` on step 4 mount |
| `GET  /api/auth/42` / `/callback` | ✅ Step 1 + Login OAuth buttons |
| `GET  /api/users/check-username` | ✅ Step 2 live availability |
| `GET  /api/users/by-username/:username` | ✅ lookup profile by username |
| `GET  /api/users/:id` | ✅ lookup profile by ID |
| `GET  /api/profile` | ✅ load own profile (settings) |
| `PUT  /api/profile` | ✅ update username/bio/pawnSkin/gridSkin in settings |
| `POST /api/profile/avatar` | ✅ upload custom avatar |
| `PUT  /api/profile/password` | ✅ change password in settings |
| `GET  /uploads/avatars/{id}.webp` | ✅ avatar serving via WAF |
| `GET  /api/leaderboard` | ✅ real database ELO leaderboard |
| `POST /api/games/ai` | ✅ start AI game (difficulty + timeLimit) |
| `GET  /api/games/active` | ✅ list active games for Resume strip |
| `GET  /api/games/:id` | ✅ load game metadata |
| `POST /api/play/start` | ✅ Board mount + `EndGameOverlay` Play again |
| `POST /api/play/move` | ✅ Board click; returns `aiMove` + telemetry + `winningLine` on game-end |
| `GET  /api/play/state` | ✅ used after a server error to revert optimistic update |
| `POST /api/play/reset` | ✅ alias for `/start`, kept for clarity |

### Pending / Future

- `GET /api/anon/session/me` — server-authoritative anon stats for the carry-over story on Step 1. Until built, Step 1 renders generic copy.
- Real-time multiplayer matching queue and spectator endpoints.

---

## 8. Locked decisions

These are settled — change requires explicit re-discussion.

| Topic | Choice | Notes |
|---|---|---|
| Brand mark | `4` in Fraunces italic | Single glyph, used in nav |
| Wordmark | `4thewin` lowercase | gen Z / app-y |
| Display font | **Fraunces** | Variable, italic-forward |
| Body font | **Public Sans** | Workhorse — NOT Inter |
| Mono font | **JetBrains Mono** | Slashed zero, ligatures, "AI lab notebook" voice |
| Default theme | None — system + toggle | Bootstrap before paint to avoid FOUC |
| Headline transitions | Subtle (fade) | No cinematic |
| Footer position | Above the fold, slim | Single-screen interactive product, not marketing |
| Mobile Login button | Hidden | Sign-up filled CTA only on small viewports |
| Anonymous play state | Server-authoritative | Cookie-keyed session. Client never reports its own score. |
| Hero plays once per visitor | `localStorage["hero-seen"]` | Inline bootstrap script reads pre-paint, adds `html.hero-seen` to skip animations on return visits |
| End-game flow | glow (1.1 s) → card | No status text overlay (was redundant). Card spans the board area on desktop, overflows on mobile so CTA isn't clipped. |
| Post-game click | Ignored, no auto-restart | User must click `Play again` on the card to start a new round. Clicking a column after game-end returns silently (auto-restart was confusing — the click also dropped a piece into the new game). |
| Anon score formula | `1000 + maxAiDepth*50 - moves*20 + outcomeBonus` | Outcome: 500 win, 100 draw, 0 loss. Computed client-side from accumulated telemetry. |
| Position slider | AI's bestScore via sigmoid | scale=150 + ±30 deadband around 0. Small heuristic flutters don't move the bar; only meaningful evaluations do. Slider crosses into the small bar at `MAIN_FRACTION = 0.96`. |
| Authed-state end-game card | Signup CTA hidden | When `isAuthenticated(Astro)` is true, the pitch + Sign up button are not rendered — only Play again remains. |
| Signup is one-shot | `signup_completed_at` on user | After step 4, `/signup` redirects to `/`. Edits go through future `/settings`. |
| Email enumeration | Vague 409 on signup | "Account creation failed" + form-level "Sign in instead?" link. Username conflicts stay specific. |
| Caching | `Cache-Control: no-store` everywhere | App is fully auth-aware; bfcache must be opted out. |

---

## 9. Anti-patterns we explicitly rolled back

What didn't work, captured so we don't relitigate.

| Pattern | Why dropped |
|---|---|
| Token-pulsating "everything always" on landing | Distracting; pulse is now sonar-ping on best-move cell only |
| Visible step counter "1/4" inside the card | Redundant with the SignupProgress tracker |
| Connect-4-token aesthetic on early signup-progress dots | Felt cartoonish; dots are now neutral pawn-* utilities, with the connect-4 beam reserved for step 4 |
| Long bouncy `signup-token-drop` (cubic-bezier(0.34, 1.56, 0.64, 1) + scale squish) | Iterative tuning didn't land it — too cartoony. Replaced with smooth ease-out slide (no bounce, no squish) |
| `client:only` for purely visual UI (icons) | Hydration flicker on every refresh. Use SSR + `dark:` variants instead (see §10.1) |
| Continuous brand-filled hover inversion on form-submit buttons | Visible flicker on retry-after-failure; submit buttons override with subtle darken |
| Text-content swap on submit (`"Sign in →"` → `"Signing in…"`) | Flickers visibly. Constant text + disabled fade is enough |
| `Cache-Control: no-store` alone | Some browsers' bfcache requires Cache-Control + Pragma + Expires together |
| Specific "Email already in use" error on signup | Account enumeration. Now vague "Account creation failed" with sign-in suggestion |
| Stats-synced animation on landing right now | Premature optimization — done now via the live `playStore` (matrix scores, depth, position slider all bound to real AI telemetry) |
| Auto-restart on column click after game over | Clicked column also dropped a piece into the new game — confusing. Replaced with explicit `Play again` button on the card. |
| Status-text overlay before the end-game card ("You win" / "You lose" / "Draw") | Redundant — the card already shows the result. Dropped, going straight from glow → card. |
| Matrix-pulse animating opacity *and* scale | The continuous opacity overrides made the AI-evaluation transition invisible (browser kept resetting opacity per pulse cycle). Pulse now scales only; opacity is driven by the registered `--matrix-base-opacity` variable + transition. |
| `currentColor` on the winning-line glow | Inherited the foreground gray instead of the pawn color — looked muddy. Replaced with explicit `oklch` pawn-color tokens (light + dark variants), `drop-shadow` (not `box-shadow`) so it follows the rounded silhouette. |
| Card content snaps mid-game (matrix + slider) | Confusing, looked like data was changing during AI compute. Now the matrix + slider freeze at the *previous* AI evaluation until the new response arrives, then transition smoothly. |

---

## 10. Frontend lessons learned

Patterns to follow + traps that have already cost us time.

### 10.1 Don't use `client:only` for purely visual UI

A React island declared with `client:only="react"` renders **nothing** at SSR. The first paint shows an empty slot; the React component appears only after hydration. For visual elements (icons, badges, indicators), this produces a flicker on every refresh — and if the surrounding layout is content-driven (`w-auto`, flex-content widths), the layout reflows when the island appears.

**Examples that hit this**: ThemeToggle (May 22) — Moon/Sun icons popped in on every refresh AND the floating pill grew by ~36 px when the toggle hydrated.

**The rule**: anything with a stable, deterministic visual representation should render at SSR. Use `client:only` only when the component **fundamentally cannot** SSR.

**The fix when you need theme-dependent UI**: render both states in SSR HTML and let CSS pick:
```astro
<svg class="size-4 dark:hidden">…moon…</svg>
<svg class="hidden size-4 dark:block">…sun…</svg>
```
Pair with the inline theme bootstrap in `RootLayout.astro` and a delegated `[data-theme-toggle]` click listener. No React island, no hydration delay, no flicker.

### 10.2 If you must use a `client:only` island, reserve its space at SSR

If `client:only` is genuinely necessary, wrap the slot in a SSR-rendered container with explicit dimensions matching the hydrated component's. Layout shifts are eliminated even if the visual is empty for a frame.

### 10.3 The `cn()` tailwind-merge extension is load-bearing

`apps/web/src/lib/utils.ts` extends `tailwind-merge` to register custom font-size tokens (`text-display`, `text-mono-sm`, etc.). Without that registration, `tailwind-merge` classifies them as text-color utilities and silently drops conflicting actual color classes. The Sign-up button rendered with invisible text for ~30 minutes before we found this. **If you add a new `--text-*` token, add it to the `cn()` extension list.**

### 10.4 Brand-filled hover inversion is for nav CTAs, not form submits

The `brand-filled` variant inverts dark→outlined on hover. Great on nav buttons (Sign up, Play). Jarring on form-submit buttons during retry-after-failure: cursor stays over the button, button transitions disabled→enabled, hover fires immediately, 75 ms inversion plays — visible flicker. Override on form submits with `className="hover:bg-foreground/90 hover:text-background"`.

### 10.5 Animation keyframe 0% must match the cell's static state

Otherwise the first frame of the animation is a visible jump from default styles to keyframe 0%. Bit us on the matrix wave (May 22) where `0%` was a trough state but cells rendered at full default opacity until the animation kicked in — every cell visibly dropped to dim before starting the wave. Fix: keyframe `0%` matches the static styles, animation goes UP from there.

### 10.6 Astro layouts don't propagate response headers reliably

`Astro.response.headers.set()` from inside a `*.astro` layout doesn't always reach the page's final response. Use **Astro middleware** (`apps/web/src/middleware.ts`) for global headers — it runs at the request boundary and modifies the actual outgoing response.

### 10.7 Optimistic UI: apply locally first, reconcile on server response

Pattern used in `playStore.play(col)` for the demo board: apply the player's piece to the local view immediately, fire `/api/play/move` in parallel, replace the view with the server's authoritative response when it arrives. Failures revert via `getState()` (or a fresh `/start` if the session is gone).

Trick to avoid: `Promise.all([request, animationFinished])` — gates the AI's reply on BOTH the network response AND a minimum animation duration (450 ms matching `piece-drop`). If the AI computes faster than the player's piece falls, the AI piece doesn't appear mid-animation; it waits for the visible drop to finish.

The optimistic update intentionally leaves `telemetry` / `lastAiMove` / `positionScore` / `telemetryBoard` UNTOUCHED — those reflect the previous AI evaluation, and clearing them caused the matrix + slider to flash empty during the compute window. Now they only update when the new AI response replaces them.

### 10.8 CSS custom properties are only animatable via `@property`

`.matrix-cell` opacity is bound to `--matrix-base-opacity` (set inline based on the AI's per-column score). Without registration, CSS custom properties are typed as `<unrecognised>` and assignments are instant — transitions on the variable do nothing. Register with:

```css
@property --matrix-base-opacity {
  syntax: '<number>';
  initial-value: 0.35;
  inherits: false;
}
```

Now `transition: --matrix-base-opacity 700ms ease-in-out` interpolates correctly when the inline value changes. Browser support is recent (Chromium good, Firefox 128+, Safari 16.4+); older browsers fall back to instant.

Caveat: animations override transitions for the same property. Don't mix — if you want a value to transition smoothly, keep the keyframe animation off that property entirely. We learned this the hard way when `matrix-pulse` animated opacity AND we tried to transition it: the pulse continuously reset the value every frame, masking the transition. Fix was to scale-pulse only and let opacity transition unmolested.

### 10.9 Keep the board's hit zone hover state in sync after layout changes

The end-game card overlays the column hit zones (z-30 vs z-20). When the user clicks `Play again` and the card unmounts, native mouseenter doesn't fire on the now-uncovered hit zones because the cursor hasn't moved — so the column the user is hovering over stays unhighlighted until they wiggle the mouse.

Fix in `Board.tsx`: a window-level `mousemove` listener stores the last cursor position; when `endGamePhase` transitions back to `idle`, we use `document.elementFromPoint(lastMousePos)` on the next animation frame to detect the column under the cursor and apply the hover highlight. Same trick is useful any time an absolute overlay unmounts and exposes interactive elements underneath.

---

## 11. Conventions

### 11.1 Git
- Conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`, etc.).
- One logical change per commit. Bug fixes land separately from refactors.
- Multi-line commit bodies — explain the why, not just the what.

### 11.2 Code
- Astro for static structure. React only for interactive state.
- Token-driven everything. No hex/rgb/inline-oklch in component code (use `bg-foreground`, not `bg-[oklch(28%_0.03_250)]`).
- `cn()` for class merging — handles the tailwind-merge extension.
- Comments explain *why*, not *what*. Code shows what.

### 11.3 Visual
- Dark mode is a first-class peer of light, not an afterthought. Test both.
- `/styleguide` is the visual smoke test — eyeball it after any token / primitive change.
- Errors are red (destructive). Brand crimson is for accent and focus, not errors.
- Form submit feedback = disabled fade. Don't swap text.

---

## 12. What's NOT in the system

Deliberate omissions, with rationale, so they don't get re-litigated.

| Not built | Rationale |
|---|---|
| **Storybook** | Heavy, slow, opinionated. `/styleguide` covers 80 % of the value with the same code that runs in production. |
| **Figma → token sync (Style Dictionary)** | No design tool in the loop. Tokens live in `globals.css`, single source of truth. |
| **Visual regression tests (Chromatic, Percy)** | Worth it for design systems with ten contributors. Overkill for a team of three. |
| **JSON/YAML token files** | Adds another layer; CSS `@theme` is the source of truth. |
| **CSS-in-JS** | Tailwind + `@utility` for the things Tailwind doesn't cover. No emotion / styled-components. |
| **Component changelog** | Too much overhead. Git history is the changelog. |
| **Per-component documentation files** | Code comments + `/styleguide` + this doc. |

---

## 13. Roadmap

### 13.1 Design system maintenance — first-class concern

When you ship a UI change, update DESIGN.md and `/styleguide` in the same PR. Treat the design system as part of the codebase's API:

- **New token?** Add it to `globals.css`, document in §1, verify in `/styleguide`.
- **New primitive?** Add to `components/ui/`, document API in §2, render in `/styleguide`.
- **New pattern emerging from feature code?** Extract it once you've copied it three times. Add to §3.
- **Inline `oklch(...)` / `bg-[…]` / `text-[#…]` in component code?** Stop — make it a token first.
- **Anti-pattern discovered?** Add it to §9 with rationale.
- **Lesson learned the hard way?** Add it to §10.

Drift between this doc and the code is the failure mode. Re-rendering `/styleguide` after a token or primitive change is the smoke test.

### 13.2 Pending primitives

Components we'll need but haven't built:

- `DropdownMenu` — for the authed-nav user-identity dropdown (Phase 2 of `apps/web/docs/authed-nav-roadmap.md`).
- `Dialog` / `AlertDialog` — for destructive confirms (delete account, kick from lobby).
- `Toast` — for transient feedback (saved, error, copied to clipboard).
- `Tabs` — for `/settings` sections.
- `Avatar` — composition of `<img>` + initial fallback + status indicator.

When any of these land, update §2 and `/styleguide`.

### 13.3 Pending pages

- `/settings` — once it ships, the signup-flow lock (§8 `signup_completed_at`) makes more sense as the only on-ramp for ongoing profile edits.
- `/u/<username>` — public profile page.
- `/play` is currently a stub. Will become the lobby + game container.

### 13.4 Animation roadmap

The piece-drop, win-line glow, and end-game card transitions all shipped (see §6). The remaining queued items: AI-thinking telemetry intensification, multiplayer connect/disconnect indicators on the leaderboard, and any future game-mode introduction animations. Each new animation is a new entry in §1.5.
