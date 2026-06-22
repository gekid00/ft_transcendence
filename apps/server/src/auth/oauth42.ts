// Helpers pour le flow OAuth 42.
// 3 fonctions qui parlent à l'API de l'intra 42 :
//   - getAuthorizationUrl() : URL où on redirige le user pour qu'il se logue sur 42
//   - exchangeCode(code)    : échange le code reçu en callback contre un access_token
//   - getUserInfo(token)    : récupère les infos publiques du user (id, login, email, image)
//
// La validation des env vars se fait LAZY (au moment de l'usage) pour ne pas crasher
// l'app entière au boot si OAuth 42 n'est pas configuré. Les autres routes (auth classique,
// users, chat...) continuent de fonctionner.

const AUTHORIZE_URL = "https://api.intra.42.fr/oauth/authorize";
const TOKEN_URL = "https://api.intra.42.fr/oauth/token";
const USER_INFO_URL = "https://api.intra.42.fr/v2/me";

export interface OAuth42User {
  id: number;
  login: string;
  email: string;
  image: { link: string };
}

// Lit une env var et throw si absente. Appelée uniquement quand les fonctions
// OAuth sont utilisées (= sur GET /api/auth/42 et /callback).
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `OAuth 42 not configured: missing env var ${name}. ` +
        `Set OAUTH42_CLIENT_ID, OAUTH42_CLIENT_SECRET, OAUTH42_REDIRECT_URI in .env or Vault.`
    );
  }
  return value;
}

// Construit l'URL où on redirige le user pour qu'il se logue sur 42.
// `state` est une string opaque (CSRF token) que 42 nous renverra dans le callback.
export function getAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv("OAUTH42_CLIENT_ID"),
    redirect_uri: requireEnv("OAUTH42_REDIRECT_URI"),
    response_type: "code",
    scope: "public",
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

// Échange le code reçu en callback contre un access_token.
export async function exchangeCode(code: string): Promise<string> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: requireEnv("OAUTH42_CLIENT_ID"),
      client_secret: requireEnv("OAUTH42_CLIENT_SECRET"),
      code,
      redirect_uri: requireEnv("OAUTH42_REDIRECT_URI"),
    }),
  });

  if (!response.ok) {
    throw new Error(`OAuth token exchange failed: ${response.status}`);
  }

  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

// Récupère les infos du user authentifié avec l'access_token.
export async function getUserInfo(accessToken: string): Promise<OAuth42User> {
  const response = await fetch(USER_INFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch 42 user info: ${response.status}`);
  }

  return (await response.json()) as OAuth42User;
}
