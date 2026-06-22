# ==============================================================================
# ft_transcendance — Makefile
# ==============================================================================
#
# Container runtime is auto-detected:
#   - On Linux/CI with podman + podman-compose: uses podman.
#   - On macOS+OrbStack (or anywhere podman isn't functional): uses docker.
#
# Override explicitly if needed:
#   make COMPOSE="docker compose" CONTAINER=docker up
# ==============================================================================

.PHONY: all up down down-force build logs ps clean help \
		dev rebuild-server rebuild-web rebuild-server-nocache rebuild-nocache \
		redeploy-stub \
		ps-all shell-app shell-server shell-postgres shell-vault \
		psql db-tables db-list \
		volumes volume-pg images prune \
		networks network-backend \
		logs-app logs-server logs-web logs-postgres logs-nginx \
		logs-vault logs-vault-init vault-status

# ──────────────────────────────────────────
# Runtime auto-detection
# ──────────────────────────────────────────

# Use podman+podman-compose if both are available AND podman is functional.
# Otherwise fall back to docker+docker-compose.
HAS_PODMAN := $(shell command -v podman-compose >/dev/null 2>&1 && podman info >/dev/null 2>&1 && echo 1)

ifeq ($(HAS_PODMAN),1)
  COMPOSE   ?= podman-compose
  CONTAINER ?= podman
else
  COMPOSE   ?= docker compose
  CONTAINER ?= docker
endif

# Couleurs — expanded at Make startup via printf so they contain real ESC
# characters (otherwise BSD echo on macOS prints them literally).
RED		= $(shell printf '\033[0;31m')
GREEN	= $(shell printf '\033[0;32m')
YELLOW	= $(shell printf '\033[1;33m')
CYAN	= $(shell printf '\033[0;36m')
GRAY	= $(shell printf '\033[0;37m')
BOLD	= $(shell printf '\033[1m')
NC		= $(shell printf '\033[0m')

# ──────────────────────────────────────────
# CONTAINERS — full stack (production-like, with WAF)
# ──────────────────────────────────────────

up:
	$(COMPOSE) up -d

build:
	$(COMPOSE) up -d --build

down:
	$(COMPOSE) down

down-force:
ifeq ($(CONTAINER),podman)
	podman pod rm -f -a
	podman rm -f -a
else
	-$(CONTAINER) rm -f $$($(CONTAINER) ps -aq)
endif

clean:
	$(COMPOSE) down -v

ps:
	$(COMPOSE) ps

ps-all:
	$(CONTAINER) ps -a

# Faster targeted rebuilds for full-stack dev (Mode A).
rebuild-server:
	$(COMPOSE) up -d --build server

rebuild-web:
	$(COMPOSE) up -d --build web

# Full rebuild ignoring Docker layer cache (fixes stale pnpm installs, etc.).
rebuild-server-nocache:
	$(COMPOSE) build --no-cache server
	$(COMPOSE) up -d server

rebuild-nocache:
	$(COMPOSE) build --no-cache
	$(COMPOSE) up -d

# ──────────────────────────────────────────
# DEV LOOP — backend in compose, frontend via pnpm dev (HMR)
# ──────────────────────────────────────────
#
# Starts postgres + vault + server + mod_security in compose, then runs the
# Astro dev server in foreground at http://localhost:4321 with HMR.
# /api/* requests are proxied to the backend at :3000 (see astro.config.mjs).
# Ctrl+C stops the dev server; the compose stack stays running.

dev:
	@echo "$(BOLD)$(CYAN)→ Starting backend services (postgres, vault, server)...$(NC)"
	$(COMPOSE) up -d postgres vault_server vault_init vault_unseal server
	@echo
	@echo "$(BOLD)$(GREEN)Frontend dev server: $(NC)$(CYAN)http://localhost:4321$(NC)"
	@echo "$(GRAY)  API → http://localhost:3000 (via Vite proxy)$(NC)"
	@echo "$(GRAY)  Vault UI → http://localhost:8200$(NC)"
	@echo "$(GRAY)  Ctrl+C stops the dev server. Backend stays up. Use 'make down' to stop everything.$(NC)"
	@echo
	cd apps/web && pnpm dev

# ──────────────────────────────────────────
# SHELLS
# ──────────────────────────────────────────

shell-server:
	$(COMPOSE) exec server sh

shell-postgres:
	$(COMPOSE) exec postgres sh

shell-vault:
	$(COMPOSE) exec vault_server sh

# ──────────────────────────────────────────
# LOGS
# ──────────────────────────────────────────

logs:
	$(COMPOSE) logs -f

logs-server:
	$(COMPOSE) logs -f server

logs-web:
	$(COMPOSE) logs -f web

logs-postgres:
	$(COMPOSE) logs -f postgres

logs-nginx:
	$(COMPOSE) logs -f mod_security

logs-vault:
	$(COMPOSE) logs -f vault_server

logs-vault-init:
	$(COMPOSE) logs -f vault_init

# ──────────────────────────────────────────
# DATABASE
# ──────────────────────────────────────────

psql:
	$(COMPOSE) exec postgres psql -U postgres_transcendence -d postgres_transcendence

db-tables:
	$(COMPOSE) exec postgres psql -U postgres_transcendence -d postgres_transcendence -c "\dt"

db-list:
	$(COMPOSE) exec postgres psql -U postgres_transcendence -c "\l"

# ──────────────────────────────────────────
# VAULT
# ──────────────────────────────────────────

vault-status:
	$(COMPOSE) exec vault_server vault status

# ──────────────────────────────────────────
# VOLUMES, IMAGES, NETWORKS
# ──────────────────────────────────────────

volumes:
	$(CONTAINER) volume ls

volume-pg:
	$(CONTAINER) volume inspect pgdata

images:
	$(CONTAINER) images

prune:
	$(CONTAINER) image prune -f

networks:
	$(CONTAINER) network ls

network-backend:
	$(CONTAINER) network inspect backend

# ──────────────────────────────────────────
# MAC + ORBSTACK ONLY — re-apply the no-keychain stub after OrbStack updates
# ──────────────────────────────────────────

redeploy-stub:
	@if [ -x "$$HOME/.local/bin/redeploy-no-keychain-stub.sh" ]; then \
		"$$HOME/.local/bin/redeploy-no-keychain-stub.sh"; \
	else \
		echo "$(YELLOW)Stub redeployer not installed.$(NC)"; \
		echo "$(GRAY)This target is only relevant on macOS with OrbStack.$(NC)"; \
	fi

# ──────────────────────────────────────────
# HELP
# ──────────────────────────────────────────

help:
	@echo ""
	@echo "$(BOLD)$(CYAN)╔════════════════════════════════════════╗$(NC)"
	@echo "$(BOLD)$(CYAN)║       ft_transcendance — Makefile      ║$(NC)"
	@echo "$(BOLD)$(CYAN)╚════════════════════════════════════════╝$(NC)"
	@echo ""
	@echo "$(GRAY)Runtime: $(BOLD)$(COMPOSE)$(NC)$(GRAY) (set HAS_PODMAN=1 or override COMPOSE/CONTAINER)$(NC)"
	@echo ""
	@echo "$(BOLD)$(YELLOW)  ── DEV LOOP (HMR + fast iteration) ─────────$(NC)"
	@echo "  $(GREEN)make dev$(NC)              $(GRAY)→ Backend in compose + Astro dev (HMR) at :4321$(NC)"
	@echo ""
	@echo "$(BOLD)$(YELLOW)  ── FULL STACK (production-like, with WAF) ─$(NC)"
	@echo "  $(GREEN)make build$(NC)            $(GRAY)→ Build all images and start everything (visit :8080)$(NC)"
	@echo "  $(GREEN)make up$(NC)               $(GRAY)→ Start without rebuild$(NC)"
	@echo "  $(GREEN)make rebuild-server$(NC)   $(GRAY)→ Rebuild + restart server only$(NC)"
	@echo "  $(GREEN)make rebuild-web$(NC)      $(GRAY)→ Rebuild + restart web only$(NC)"
	@echo "  $(GREEN)make rebuild-server-nocache$(NC) $(GRAY)→ Rebuild server ignoring Docker cache$(NC)"
	@echo "  $(GREEN)make rebuild-nocache$(NC)  $(GRAY)→ Rebuild everything ignoring Docker cache$(NC)"
	@echo "  $(GREEN)make down$(NC)             $(GRAY)→ Stop containers (volumes preserved)$(NC)"
	@echo "  $(GREEN)make down-force$(NC)       $(GRAY)→ Force-stop everything$(NC)"
	@echo "  $(GREEN)make clean$(NC)            $(GRAY)→ Stop + remove volumes (nukes Vault and DB)$(NC)"
	@echo "  $(GREEN)make ps$(NC)               $(GRAY)→ Container status$(NC)"
	@echo ""
	@echo "$(BOLD)$(YELLOW)  ── LOGS ────────────────────────────────────$(NC)"
	@echo "  $(GREEN)make logs$(NC)             $(GRAY)→ All services$(NC)"
	@echo "  $(GREEN)make logs-server$(NC)      $(GRAY)→ Fastify backend$(NC)"
	@echo "  $(GREEN)make logs-web$(NC)         $(GRAY)→ Astro frontend container$(NC)"
	@echo "  $(GREEN)make logs-postgres$(NC)    $(GRAY)→ PostgreSQL$(NC)"
	@echo "  $(GREEN)make logs-nginx$(NC)       $(GRAY)→ ModSec WAF (nginx)$(NC)"
	@echo "  $(GREEN)make logs-vault$(NC)       $(GRAY)→ Vault server$(NC)"
	@echo "  $(GREEN)make logs-vault-init$(NC)  $(GRAY)→ Vault init script$(NC)"
	@echo ""
	@echo "$(BOLD)$(YELLOW)  ── SHELLS + DATABASE ───────────────────────$(NC)"
	@echo "  $(GREEN)make shell-server$(NC)     $(GRAY)→ Shell into server container$(NC)"
	@echo "  $(GREEN)make shell-postgres$(NC)   $(GRAY)→ Shell into postgres container$(NC)"
	@echo "  $(GREEN)make shell-vault$(NC)      $(GRAY)→ Shell into vault container$(NC)"
	@echo "  $(GREEN)make psql$(NC)             $(GRAY)→ psql REPL$(NC)"
	@echo "  $(GREEN)make db-tables$(NC)        $(GRAY)→ List tables$(NC)"
	@echo "  $(GREEN)make db-list$(NC)          $(GRAY)→ List databases$(NC)"
	@echo "  $(GREEN)make vault-status$(NC)     $(GRAY)→ Vault sealed/unsealed status$(NC)"
	@echo ""
	@echo "$(BOLD)$(YELLOW)  ── INFRA ───────────────────────────────────$(NC)"
	@echo "  $(GREEN)make volumes$(NC)          $(GRAY)→ List volumes$(NC)"
	@echo "  $(GREEN)make images$(NC)           $(GRAY)→ List images$(NC)"
	@echo "  $(GREEN)make prune$(NC)            $(GRAY)→ Prune unused images$(NC)"
	@echo "  $(GREEN)make networks$(NC)         $(GRAY)→ List networks$(NC)"
	@echo ""
	@echo "$(BOLD)$(YELLOW)  ── MACOS / ORBSTACK ────────────────────────$(NC)"
	@echo "  $(GREEN)make redeploy-stub$(NC)    $(GRAY)→ Re-apply no-keychain stub after OrbStack update$(NC)"
	@echo ""
