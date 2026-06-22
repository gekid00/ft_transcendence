#!/bin/sh
# vault_init — first-boot only. Initializes Vault and seeds the project
# secrets (DB password, JWT secret, OAuth42 credentials).
#
# On subsequent compose ups (vault already initialized) this script skips
# the init/unseal/enable steps but still re-syncs OAuth42 from .env — that
# way, filling OAUTH42_CLIENT_ID/SECRET in .env (before or after the first
# `make build`) and re-running compose is enough; no manual `vault kv put`.
# The vault_unseal watchdog handles the rest of steady-state — re-unsealing
# after restarts and re-creating /vault/file/.db_pass when postgres consumes
# it. Keeping the responsibilities split (init vs watchdog) avoids the
# previous failure modes where init.sh's else branch tried to read from a
# sealed Vault and silently wrote an empty .db_pass.

set -e

apk add --no-cache jq openssl

export VAULT_ADDR="http://vault_server:8200"

# Pushes OAuth42 creds from the .env-sourced env vars into Vault. No-op if
# they're blank, so an empty .env never stomps a value pushed by hand.
sync_oauth() {
	if [ -n "$OAUTH42_CLIENT_ID" ] && [ -n "$OAUTH42_CLIENT_SECRET" ]; then
		echo "Syncing OAuth42 credentials from .env into Vault..."
		vault kv put -mount=secret transcendence/oauth42 \
			client_id="$OAUTH42_CLIENT_ID" \
			client_secret="$OAUTH42_CLIENT_SECRET"
	else
		echo "OAUTH42_CLIENT_ID/SECRET not set in .env — leaving Vault OAuth42 secret as-is."
	fi
}

INITIALIZED=$(vault status -format=json 2>/dev/null | jq -r '.initialized' || echo "false")

if [ "$INITIALIZED" = "true" ]; then
	echo "Vault already initialized — vault_unseal watchdog handles re-seal and .db_pass rehydration"

	# Vault may still be sealed for a moment right after vault_server starts;
	# give the watchdog a few seconds to unseal before syncing OAuth.
	export VAULT_TOKEN="$(cat /vault/file/root.token)"
	i=0
	while [ "$(vault status -format=json 2>/dev/null | jq -r '.sealed')" = "true" ] && [ "$i" -lt 15 ]; do
		sleep 1
		i=$((i + 1))
	done

	sync_oauth
	exit 0
fi

echo "Vault initialization (first boot)..."

INIT_STARTING=$(vault operator init -key-shares=1 -key-threshold=1 -format=json)

echo "Backup of unseal key and root token..."
echo "$INIT_STARTING" | jq -r '.unseal_keys_b64[0]' > /vault/file/unseal.key
echo "$INIT_STARTING" | jq -r '.root_token'          > /vault/file/root.token
chmod 644 /vault/file/root.token
chmod 644 /vault/file/unseal.key

echo "Unsealing..."
vault operator unseal "$(cat /vault/file/unseal.key)"

export VAULT_TOKEN="$(cat /vault/file/root.token)"

echo "Activation KV v2..."
vault secrets enable -path=secret kv-v2

DB_PASS="$(openssl rand -base64 24)"
JWT_SECRET="$(openssl rand -base64 48)"

vault kv put -mount=secret transcendence/jwt \
	value="$JWT_SECRET"

vault kv put -mount=secret transcendence/database \
	password="$DB_PASS"

sync_oauth

# Bootstrap .db_pass once. After this, the vault_unseal watchdog rewrites it
# whenever postgres consumes the file on a subsequent boot.
echo "$DB_PASS" > /vault/file/.db_pass

echo "Vault first-init done."
