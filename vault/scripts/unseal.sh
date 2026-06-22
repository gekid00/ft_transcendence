#!/bin/sh
# vault_unseal — long-running watchdog that keeps Vault unsealed and
# /vault/file/.db_pass present so the rest of the stack recovers from any
# restart cycle without manual intervention.
#
# Two invariants checked every 10s:
#   1. Vault is unsealed         — so secret reads succeed (server boot, etc.)
#   2. /vault/file/.db_pass exists — so postgres' wait-for-secret loop unblocks
#
# Self-healing. If Vault re-seals (every vault_server restart does this), or
# postgres consumes .db_pass on its boot, the watchdog notices on the next
# iteration and restores the invariant.
#
# Pre-watchdog history: this script ran once and exited. After the first
# successful run any vault_server restart left Vault sealed forever; any
# postgres restart hung waiting for .db_pass that nothing recreated.

# Don't bail on a single failed iteration — keep watching.
set +e

apk add --no-cache jq >/dev/null 2>&1 || true

export VAULT_ADDR="http://vault_server:8200"

log() {
	printf "[vault_unseal] %s\n" "$*"
}

log "watchdog started; polling every 10s"

while true; do
	if [ -f /vault/file/root.token ]; then
		VAULT_TOKEN=$(cat /vault/file/root.token)
		export VAULT_TOKEN

		# 1. Unseal if sealed.
		SEALED=$(vault status -format=json 2>/dev/null | jq -r '.sealed' 2>/dev/null)
		if [ "$SEALED" = "true" ]; then
			log "vault sealed → unsealing"
			if vault operator unseal "$(cat /vault/file/unseal.key)" >/dev/null 2>&1; then
				log "vault unsealed"
			else
				log "unseal failed (will retry next iteration)"
			fi
			# Re-check so step 2 sees the fresh state.
			SEALED=$(vault status -format=json 2>/dev/null | jq -r '.sealed' 2>/dev/null)
		fi

		# 2. Recreate /vault/file/.db_pass if missing (postgres consumes the
		#    file on every boot — `rm -f /vault/file/.db_pass` after read).
		#    Only attempt while vault is unsealed; reading a sealed vault would
		#    write an empty file and break postgres.
		if [ "$SEALED" = "false" ] && [ ! -f /vault/file/.db_pass ]; then
			DB_PASS=$(vault kv get -field=password secret/transcendence/database 2>/dev/null)
			if [ -n "$DB_PASS" ]; then
				log ".db_pass missing → rewriting from vault"
				printf "%s" "$DB_PASS" > /vault/file/.db_pass
			fi
		fi
	fi

	sleep 10
done
