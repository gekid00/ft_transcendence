// Loader Vault : au démarrage du back, lit les secrets depuis Vault et les met dans process.env.
//
// Si Vault n'est pas configuré (pas de VAULT_ADDR / VAULT_TOKEN) ou inaccessible,
// on tombe sur les valeurs déjà présentes dans process.env (fichier .env local).
// → ça permet de bosser en dev sans avoir besoin de lancer Vault.
//
// Paths attendus dans Vault (KV v2 sous `secret/`) :
//   secret/transcendence/jwt        → { value }
//   secret/transcendence/oauth42    → { client_id, client_secret }
//   secret/transcendence/database   → { url }

import fs from "fs";

interface KvV2Response {
  data: { data: Record<string, string> };
}

async function readSecret(addr: string, token: string, path: string): Promise<Record<string, string> | null> {
  try {
    const res = await fetch(`${addr}/v1/secret/data/${path}`, {
      headers: { "X-Vault-Token": token },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as KvV2Response;
    return json.data.data;
  } catch {
    return null;
  }
}

export async function loadFromVault(): Promise<void> {
  const addr = process.env.VAULT_ADDR;
  let token: string | undefined;

  if (fs.existsSync("/vault/file/root.token")) {
    token = fs.readFileSync("/vault/file/root.token", "utf8").trim();
  } else {
    token = process.env.VAULT_TOKEN;
  }

  if (!addr || !token) {
    console.log("[vault] Not configured, using .env values directly");
    return;
  }

  console.log(`[vault] Loading secrets from ${addr}...`);

  const jwt = await readSecret(addr, token, "transcendence/jwt");
  if (jwt?.value) process.env.JWT_SECRET = jwt.value;

  const oauth = await readSecret(addr, token, "transcendence/oauth42");
  if (oauth?.client_id) process.env.OAUTH42_CLIENT_ID = oauth.client_id;
  if (oauth?.client_secret) process.env.OAUTH42_CLIENT_SECRET = oauth.client_secret;

  const db = await readSecret(addr, token, "transcendence/database");
  if (db?.password) {
    const dbUser = process.env.POSTGRES_USER || "postgres_transcendence";
    const dbName = process.env.POSTGRES_DB || "postgres_transcendence";
    const dbHost = process.env.POSTGRES_HOST || "postgres";
    
  const dbPass = encodeURIComponent(db.password);
  process.env.DATABASE_URL = `postgresql://${dbUser}:${dbPass}@${dbHost}:5432/${dbName}`;
  }

  console.log("[vault] Secrets loaded");
}