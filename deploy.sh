#!/bin/bash

# stopper le script si une erreur est rencontrée
# e = commande echoue / u = une variable indéfinie est utilisée / o pipefail = commande dans un pipe échoue
set -euo pipefail

# vérifier que podman et podman compose sont installés
command -v podman >/dev/null 2>&1 || { echo "Podman required"; exit 1; }
command -v podman-compose >/dev/null 2>&1 || { echo "podman-compose required"; exit 1; }

if [ ! -f .env ]; then
    echo "Error: .env file not found."
    echo "→ Please run: 'cp .env.example .env' and update your credentials."
    exit 1
fi

set -a
source .env
set +a

echo "Environment variables loaded successfully!"

: "${VAULT_TOKEN:?VAULT_TOKEN required}"

echo "Setting permissions..."
chmod +x vault/scripts/*.sh

echo "Starting ft_transcendence..."
make build

# echo "Initializing Vault..."
# bash scripts/init-vault.sh

echo "Deployment complete!"
# echo "App: http://localhost"
# echo "Vault UI: http://localhost:8200"
