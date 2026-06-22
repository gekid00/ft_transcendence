# 4thewin — Real-time multiplayer Connect 4 platform

> Full-stack web application built as the capstone project of the 42 curriculum (`ft_transcendence`).
> A production-style multiplayer game platform: real-time 1v1 matches, an AI opponent, ELO ranking, social features (friends, chat, notifications), and a containerized, security-hardened deployment.

**My role:** Tech Lead & Backend Developer (5-person team). I owned the backend architecture, authentication, the real-time social layer, and the test suite — see [My contribution](#my-contribution).

---

## What this project demonstrates

This wasn't a tutorial app — it's a self-contained, multi-service system designed to mirror how a real product is built and shipped:

- **Real-time gameplay over WebSockets** — synchronized game state, reconnection handling, and auto-abandon, not just request/response.
- **A non-trivial game AI** — iterative-deepening minimax with alpha-beta pruning and a transposition table, with three difficulty levels.
- **Type-safety end to end** — TypeScript everywhere, runtime-validated API boundaries (Zod), and a type-safe ORM (Drizzle) over PostgreSQL.
- **Security as a first-class concern** — a WAF in front of the app, a secrets manager (Vault), JWT auth over HttpOnly cookies, and bcrypt password hashing.
- **One-command, reproducible deployment** — 7 orchestrated containers, brought up with a single `make build`.
- **A real test suite** — 150+ unit and integration tests (Vitest) plus E2E coverage (Playwright).

---

## Architecture at a glance

```
                          ┌──────────────────────────────┐
   Browser  ──HTTPS──▶    │  ModSecurity + OWASP CRS WAF │   reverse proxy, TLS termination
   :8443                  │         (port 8443)          │   (paranoia level 2)
                          └───────────────┬──────────────┘
                                          │ HTTP (internal network)
                      ┌───────────────────┴───────────────────┐
                      ▼                                        ▼
            ┌──────────────────┐                    ┌────────────────────┐
            │   web (Astro)    │   REST + WS        │  server (Fastify)  │
            │  SSR + React     │ ◀───────────────▶  │   TypeScript       │
            │  islands         │                    │   Socket.io        │
            └──────────────────┘                    └─────────┬──────────┘
                                                              │
                                       ┌──────────────────────┼──────────────────────┐
                                       ▼                                              ▼
                              ┌─────────────────┐                          ┌────────────────────┐
                              │  PostgreSQL 17  │                          │  HashiCorp Vault   │
                              │  (Drizzle ORM)  │                          │  secrets at boot   │
                              └─────────────────┘                          └────────────────────┘
```

Everything runs behind the WAF. The backend never faces the internet directly and pulls all of its secrets (JWT signing key, DB password, OAuth credentials) from Vault at startup rather than from environment files.

---

## Technical stack & rationale

| Layer | Choice | Why |
|---|---|---|
| **Frontend** | Astro + React | SSR for public/SEO pages; React "islands" only where interactivity is needed (game board, chat, settings) — minimal client JS. |
| **Styling** | Tailwind CSS v4 | Utility-first, consistent design system, fast iteration. |
| **Backend** | Fastify + TypeScript | High-throughput HTTP server with first-class TypeScript and a clean plugin model. |
| **Real-time** | Socket.io | Room-based WebSocket abstraction with reconnection and fallbacks; per-user rooms (`user:<id>`) for targeted pushes. |
| **ORM** | Drizzle ORM | SQL-like, fully type-safe queries with first-class migrations — lighter than Prisma. |
| **Database** | PostgreSQL 17 | ACID guarantees, JSONB for flexible fields (notifications, AI telemetry). |
| **Auth** | JWT + bcrypt | Stateless auth via HttpOnly cookies (7-day expiry); bcrypt (12 rounds) for password hashing. |
| **SSO** | 42 OAuth 2.0 | School SSO with CSRF protection via the `state` parameter; auto-provisions accounts on first login. |
| **Validation** | Zod | Runtime request validation through `@fastify/type-provider-zod`; schemas shared across routes. |
| **WAF** | ModSecurity + OWASP CRS | Industry-standard rules at paranoia level 2 in front of the whole stack. |
| **Secrets** | HashiCorp Vault | KV v2 store; init/unseal handled by dedicated watchdog containers. |
| **Containers** | Podman + podman-compose | Rootless, daemonless, Docker-compatible (Makefile auto-detects Docker vs Podman). |
| **Testing** | Vitest + Playwright | Unit/integration on an isolated test DB; E2E for public flows. |

The repository is a **pnpm monorepo** (`apps/web`, `apps/server`, shared `packages/*`) so the frontend and backend share types and tooling.

---

## Backend design highlights

The backend (`apps/server/src`) is organized by responsibility rather than by framework convention:

```
routes/      REST endpoints  (auth, users, friends, chat, lobbies, games, leaderboard, notifications)
socket/      Socket.io handlers (auth handshake, game, lobby, chat)
game/        Pure game logic  (board, win/draw detection, AI minimax, ELO)
auth/        JWT, bcrypt, 42 OAuth, route middleware
db/          Drizzle schema, relations, client
schemas/     Zod request/response schemas
config/      Vault loader and runtime config
```

A few decisions worth calling out:

- **The game engine is pure and framework-agnostic.** Board state, win/draw detection, ELO math, and the AI live in `game/` with no knowledge of HTTP or sockets, which makes them trivial to unit-test in isolation.
- **The AI is a real search.** Iterative-deepening minimax (max depth 16) with alpha-beta pruning and a transposition table, using shallow-search move ordering to feed deeper passes. Difficulty maps to search depth/quality (`easy` / `medium` / `hard`).
- **Validation lives at the boundary.** Every route declares a Zod schema; invalid payloads are rejected before any handler logic runs.
- **Targeted real-time delivery.** Each connected user joins a personal Socket.io room, so notifications, chat, and game events are pushed precisely to the right clients.

### Data model

PostgreSQL with 8 tables (`users`, `friendships`, `blocked_users`, `games`, `moves`, `lobbies`, `chat_messages`, `notifications`). Users carry their auth state, profile, cosmetics, and aggregate stats (games played/won/lost/drawn, ELO `rating`, `peak_rating`). Full schema: [`apps/server/src/db/schema.ts`](apps/server/src/db/schema.ts).

---

## Features

- **Gameplay** — play vs. AI (3 difficulties) or challenge real players in real-time 1v1 matches.
- **Lobbies** — public and private rooms with mode and timer options.
- **Ranking** — ELO rating (`K = 32`), titles, match history, win-rate, and a global leaderboard.
- **Social** — friends with online presence, direct chat with typing indicators, user blocking, and play invites.
- **Notifications** — DB-persisted and pushed in real time, with a frontend dropdown.
- **Profiles & settings** — editable profile, avatar upload (MIME-validated, 2 MB cap, auto-resized + WebP), board/pawn cosmetics, GDPR-style account anonymization.
- **Auth** — email/password signup with a 4-step onboarding wizard, plus 42 OAuth SSO.

---

## Running it locally

### Prerequisites
- A container runtime: `podman` + `podman-compose` (Linux) **or** Docker (macOS via OrbStack / Docker Desktop). The Makefile auto-detects which is available.
- `pnpm` for the local dev workflow.
- A `.env` at the repo root (copy from `.env.example` — never committed).

### One-command setup
```sh
cp .env.example .env
make build          # builds all images and starts the full stack
```
Then open **https://localhost:8443** (self-signed cert — accept the browser warning).

### Dev workflow
```sh
make dev            # backend in compose + Astro dev server at localhost:4321
make rebuild-server # rebuild backend after changes (~10s)
make rebuild-web    # rebuild frontend after changes (~15s)
make logs-server    # tail backend logs
make down           # stop everything (state preserved)
make clean          # stop + wipe volumes (resets DB + Vault)
make help           # list every target
```

### Database & tests
```sh
pnpm --filter server db:migrate    # apply migrations
pnpm --filter server db:studio     # Drizzle Studio
pnpm --filter server test          # Vitest unit/integration suite
pnpm --filter web   test:e2e       # Playwright E2E
```

| Service | Production (Mode A) | Dev (Mode B) |
|---|---|---|
| Frontend | https://localhost:8443 | http://localhost:4321 |
| Backend API | internal only | http://localhost:3000 |
| Vault UI | http://localhost:8200/ui | http://localhost:8200/ui |

---

## My contribution

This was a 5-person team project. As **Tech Lead & Backend Developer**, I owned:

- **Architecture** — overall backend structure, service decomposition, database schema, and Socket.io room strategy; led code review.
- **Authentication** — the full auth system: email/password signup & login, JWT issuance over HttpOnly cookies, bcrypt hashing, and 42 OAuth 2.0 integration.
- **Real-time social layer** — friends, chat, and notification systems end to end (REST routes, Zod schemas, and Socket.io handlers).
- **Profiles & uploads** — user profile management, settings, and avatar upload with MIME validation and image processing.
- **Validation & quality** — the Zod schemas for every API route, and the test infrastructure (Vitest + isolated test DB) with **150+ unit/integration tests** covering the route handlers.

The rest of the team handled the game engine & AI, frontend/UX, and the WAF/Vault/container infrastructure — credited in the project history.

---

## Known limitations

- **HTTPS** uses a self-signed certificate, so browsers show a security warning in local runs.
- **42 OAuth** requires a registered 42 application; its credentials are pushed into Vault on first setup.

---

*Built as part of the 42 curriculum by a team of 5 (rbourkai, kgriset, shtounek, tnolent, agallot).*
