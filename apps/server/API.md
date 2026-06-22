# API Backend — Référence

Documentation des endpoints HTTP et events Socket.io exposés par `apps/server/`.

---

## Sommaire

- [Bases](#bases)
- [Auth](#auth)
- [Profil & users](#profil--users)
- [Stats & historique (B10)](#stats--historique-b10)
- [Amis & blocage](#amis--blocage)
- [Chat](#chat)
- [Notifications](#notifications)
- [Lobbies](#lobbies)
- [Jeu](#jeu)
- [Socket.io](#socketio)
- [Codes d'erreur](#codes-derreur)

---

## Bases

- **Base URL** (dev) : `http://localhost:3000`
- **Toutes les routes** sont préfixées par `/api/...` sauf `/health` et `/uploads/...`
- **Format** : JSON pour les bodies et réponses (sauf upload avatar = multipart/form-data)
- **Auth** : cookie HttpOnly `auth_token` (JWT, 7 jours). Posé par signup/login, effacé par logout.
- **CORS** : autorise `FRONTEND_URL` (par défaut `http://localhost:4321`) avec `credentials: true`

### Côté frontend, à savoir

Toutes les requêtes vers une route protégée doivent inclure les cookies :

```ts
fetch("http://localhost:3000/api/profile", {
  credentials: "include",        // important !
});
```

### Health check

| Méthode | Endpoint | Auth | Réponse |
|---|---|---|---|
| GET | `/health` | non | `{ "status": "ok" }` |

---

## Auth

### `POST /api/auth/signup` — créer un compte

Body :
```json
{ "email": "x@42.fr", "username": "x", "password": "min8chars" }
```
Réponse `201` : `{ id, email, username }` + cookie `auth_token` posé.

Erreurs :
- `400` champs manquants ou password < 8.
- `409` `Username already taken` : username déjà pris (info publique, OK d'être explicite).
- `409` `Account creation failed` : message volontairement vague — typiquement email déjà
  enregistré, mais on évite l'énumération de comptes en ne le confirmant pas. Le frontend
  affiche un message générique + propose `Sign in instead?` pour pousser l'utilisateur
  légitime vers `/login`.

### `POST /api/auth/login` — se connecter

Body :
```json
{ "email": "x@42.fr", "password": "..." }
```
Réponse `200` : `{ id, email, username }` + cookie posé.
Erreurs : `401` credentials invalides.

### `POST /api/auth/logout` — se déconnecter

Pas de body. Réponse `200` : `{ "message": "Logged out" }`. Cookie effacé.

### `GET /api/auth/me` — récupérer le user connecté

Auth requise. Réponse `200` :
```json
{ "id", "email", "username", "avatarUrl", "bio" }
```
Erreurs : `401` non connecté.

### `GET /api/auth/42?intent=signup|login` — démarrer OAuth 42

Redirige vers la page d'autorisation de l'intra 42. Pas de réponse JSON, c'est un `302`.

Le serveur génère un token `state` aléatoire (CSRF), le stocke dans un cookie HttpOnly
`oauth42_state` (path: `/api/auth/42`, max-age 10 min), et l'inclut dans l'URL OAuth.
Le cookie contient aussi l'`intent` reçu en query :
- `intent=signup` (passé par la page `/signup`) → après callback, les nouveaux comptes
  sont redirigés vers `/signup?step=3` (skip credentials, OAuth a fourni email + login).
- `intent=login` (par défaut, passé par le bouton Login) → callback redirige vers `/`.

### `GET /api/auth/42/callback` — fin du flow OAuth 42

Appelé par 42 avec `?code=` et `?state=`. Le serveur :
1. Vérifie que `state` du query matche celui stocké dans le cookie `oauth42_state` (CSRF).
   Sinon → `400 Invalid OAuth state`.
2. Efface le cookie state (single-use).
3. Échange `code` contre un access_token, récupère les infos du user.
4. Account linking : si déjà connecté → lie l'OAuth ID, redirige `/profile?linked=true`.
5. Sinon, cherche par OAuth ID puis par email. Crée un user si rien trouvé.
6. Pose le cookie d'auth, redirige selon `intent` :
   - `signup` + nouveau compte → `${FRONTEND_URL}/signup?step=3`
   - `login` ou compte existant → `${FRONTEND_URL}/`

---

## Profil & users

### `GET /api/users/:id` — profil public

Pas d'auth. Réponse `200` :
```json
{ "id", "username", "avatarUrl", "bio", "status", "gamesPlayed", "gamesWon", "gamesLost", "gamesDrawn" }
```
Si user supprimé : `{ "id", "username": "Joueur supprimé", "avatarUrl": null }`.

### `GET /api/users/check-username?q=...` — vérifier si un username est dispo

**Pas d'auth** (utilisé par le formulaire de signup avant que l'user soit logged in).
Renvoie uniquement `{ available: boolean }` — pas d'autre info pour limiter l'enumeration.

Validation : 3–30 caractères, `[a-zA-Z0-9_]`. Si l'input ne match pas la regex,
renvoie `{ available: false }` directement (sans donner la raison).

> **TODO(rate-limit)** : ajouter `@fastify/rate-limit` au backend et gater cette route
> à ~10 req/min/IP pour mitiger l'enumeration.

### `GET /api/users/search?q=...` — recherche par username

Auth requise. Insensible à la casse, `LIKE %q%`, max 20 résultats.
Réponse : `[{ id, username, avatarUrl, status }, ...]`.

### `GET /api/profile` — son propre profil

Auth requise. Inclut email, skins, flag OAuth lié.

### `PUT /api/profile` — éditer son profil

Auth requise. Body partiel :
```json
{ "username"?: "...", "bio"?: "...", "pawnSkin"?: "...", "gridSkin"?: "..." }
```
Validations :
- `username` : 3-30 caractères, `[a-zA-Z0-9_]` (mêmes contraintes que /signup).
- `bio` : ≤ 160 caractères.
- `pawnSkin` : `default` | `wine` | `coral` | `brick`.
- `gridSkin` : `default` | `ink` | `slate`.

Erreurs : `400` validation / `409` username déjà pris.

### `PUT /api/profile/email` — changer l'email

Auth requise + **re-auth password**. Body :
```json
{ "currentPassword": "...", "newEmail": "..." }
```
Erreurs : `400` compte OAuth-only sans password / `401` mauvais password / `409` email déjà pris.

### `PUT /api/profile/password` — changer le password

Auth requise + **re-auth password**. Body :
```json
{ "currentPassword": "...", "newPassword": "min8chars" }
```

### `POST /api/profile/avatar` — upload avatar

Auth requise. **multipart/form-data**, champ `avatar`. JPG/PNG/WebP, max 2 MB.
L'image est redimensionnée en 500x500 max et convertie en `.webp`.
Réponse : `{ "avatarUrl": "/uploads/avatars/{userId}.webp?t=..." }`.

### `DELETE /api/profile` — supprimer son compte (anonymisation)

Auth requise. Marque `is_deleted = true`, vide bio/avatar/oauth, déconnecte.

### `GET /uploads/avatars/{userId}.webp` — récupérer un avatar

Pas d'auth. Sert directement le fichier.

---

## Stats & historique (B10)

Routes publiques (pas d'auth) : elles alimentent la page profil de n'importe quel
user. Un compte supprimé (`is_deleted`) apparaît partout comme `"Joueur supprimé"`,
avatar `null`. `404` si l'`id` n'existe pas.

### `GET /api/users/:id/stats` — compteurs + win rate

Pas d'auth. Réponse `200` :
```json
{ "gamesPlayed": 12, "gamesWon": 7, "gamesLost": 4, "gamesDrawn": 1, "winRate": 58.3 }
```
`winRate` = `gamesWon / gamesPlayed * 100`, arrondi à 1 décimale (`0` si aucune partie).

### `GET /api/users/:id/games?page=1&limit=10` — historique des parties

Pas d'auth. Seules les parties terminées (`finished` / `abandoned`), triées de la
plus récente à la plus ancienne. `page` ≥ 1 (défaut 1), `limit` ∈ [1, 50] (défaut 10).
Réponse `200` :
```json
{
  "page": 1,
  "limit": 10,
  "total": 12,
  "games": [
    {
      "id": 42,
      "mode": "connect4",
      "result": "win",
      "status": "finished",
      "isAiOpponent": false,
      "aiDifficulty": null,
      "opponent": { "id": 7, "username": "alice", "avatarUrl": "/uploads/..." },
      "finishedAt": "2026-05-30T18:21:00.000Z"
    }
  ]
}
```
`result` est du point de vue du user demandé : `"win"` | `"loss"` | `"draw"`.
Pour une partie IA : `opponent = { "id": null, "username": "IA", "avatarUrl": null }`
et `aiDifficulty` est renseigné.

### `GET /api/users/:id/opponents` — top 3 adversaires les plus fréquents

Pas d'auth. Adversaires humains uniquement (les parties IA sont exclues), triés par
nombre de parties jouées ensemble. Réponse `200` :
```json
{
  "opponents": [
    { "id": 7, "username": "alice", "avatarUrl": "/uploads/...", "gamesAgainst": 5 }
  ]
}
```

---

## Amis & blocage

### `GET /api/friends` — liste des amis acceptés

Auth requise. Réponse : `[{ friendshipId, id, username, avatarUrl, status }, ...]`.

### `GET /api/friends/requests` — demandes reçues en attente

Auth requise. Réponse : `[{ friendshipId, id, username, avatarUrl }, ...]`.

### `POST /api/friends/request` — envoyer une demande d'ami

Auth requise. Body : `{ "userId": 42 }`.
Réponse `201` : `{ id, status: "pending" }`. Notif auto pour le destinataire.
Erreurs : `400` soi-même / `404` user inexistant / `403` blocage / `409` amitié déjà existante.

### `POST /api/friends/respond` — accepter ou refuser

Auth requise. Body : `{ "friendshipId": 5, "accept": true }`.
Si accept : `{ "status": "accepted" }` + notif auto pour l'envoyeur.
Si decline : `{ "status": "declined" }` (la ligne est supprimée).

### `DELETE /api/friends/:id` — supprimer un ami (ou annuler une demande)

Auth requise. `:id` = friendship id (pas user id).

### `POST /api/block` — bloquer un user

Auth requise. Body : `{ "userId": 42 }`.
Supprime toute amitié existante entre les 2, idempotent.

### `DELETE /api/block/:id` — débloquer un user

Auth requise. `:id` = **user id** du bloqué.

---

## Chat

### `GET /api/chat` — liste des conversations

Auth requise. Renvoie 1 entrée par contact, avec le dernier message :
```json
[{ "id", "username", "avatarUrl", "status", "lastMessage", "lastMessageAt" }, ...]
```
Les conversations avec users bloqués sont filtrées.

### `GET /api/chat/:userId?limit=50&offset=0` — historique avec un user

Auth requise. Trié du + récent au + ancien.
Erreurs : `403` blocage en cours.

> **L'envoi de messages se fait via Socket.io, pas en REST.** Voir [Socket.io](#socketio).

---

## Notifications

### `GET /api/notifications` — mes notifs (non-lues d'abord, max 50)

Auth requise. Réponse :
```json
[{ "id", "userId", "type", "content": {...}, "read", "createdAt" }, ...]
```

Types possibles : `friend_request`, `friend_accepted`, `game_invite`, `game_finished`, `chat_message`.

### `GET /api/notifications/unread-count` — compteur badge

Auth requise. Réponse : `{ "count": 3 }`.

### `PATCH /api/notifications/:id/read` — marquer une notif comme lue

Auth requise. `404` si la notif n'appartient pas à l'user (sécurité).

### `PATCH /api/notifications/read-all` — tout marquer comme lu

Auth requise.

---

## Lobbies

Salon d'attente pour une partie 1v1. Le créateur choisit le mode, le temps et la
visibilité ; un **code de 6 caractères** est généré. Toutes les routes nécessitent l'auth.

### `GET /api/lobbies` — liste des lobbies

Filtres query optionnels : `?mode=connect4|connect5`, `?status=waiting|in_progress|closed`,
`?time=300|600|3600`. Réponse `200` : `[lobby, ...]` (lignes complètes de la table `lobbies`).

### `POST /api/lobbies` — créer un lobby

Body (tous optionnels) :
```json
{ "isPublic": true, "mode": "connect4", "timePerPlayerSeconds": 300 }
```
Défauts : `isPublic=true`, `mode="connect4"`, `timePerPlayerSeconds=300`.
`timePerPlayerSeconds` ∈ `{300, 600, 3600}`.
Réponse `201` : l'objet lobby créé, avec un `code` de 6 caractères.
Erreurs : `400` si le temps est invalide.

### `POST /api/lobbies/:id/join` — rejoindre un lobby

Body : `{ "code": "ABC123" }` — **requis uniquement si le lobby est privé**.
Réponse `200` : le lobby mis à jour. Émet `lobby:update` à la room (cf. Socket.io).
Erreurs : `404` introuvable / `400` plus en attente, déjà complet, ou déjà dedans / `403` code invalide.

### `POST /api/lobbies/:id/leave` — quitter un lobby

Si le **créateur** quitte → lobby fermé (`status: "closed"`). Si le player 2 quitte → place libérée.
Réponse `200` : `{ "message": "..." }`. Émet `lobby:update`.
Erreurs : `404` / `400` si la partie est en cours / `403` pas dans ce lobby.

### `POST /api/lobbies/:id/start` — démarrer la partie

**Créateur uniquement, 2 joueurs requis.** Crée la partie en DB, ferme le lobby
(`status: "in_progress"`), enregistre la partie active côté serveur, puis émet
`game:start { gameId }` aux 2 joueurs (sur leur room `user:<id>`).
Réponse `201` : `{ "gameId": 42 }`.
Erreurs : `404` / `403` pas le créateur / `400` plus en attente ou moins de 2 joueurs.

---

## Jeu

Deux systèmes **distincts**, à choisir selon l'écran :

- **A — vs IA anonyme** (`/api/play/*`) : REST pur, sans compte, session par cookie, pas de DB, pas de socket.
- **B — connecté** (`/api/games/*` + lobbies + Socket.io) : auth requise, persisté en DB, temps réel via socket. C'est le mode 1v1 et le mode IA pour un user connecté.

### A) Jeu vs IA anonyme — `/api/play/*`

Pas d'auth. La session est portée par un cookie HttpOnly `play_session` (opaque, géré par
le serveur). L'état est **serveur-autoritaire** : le client n'envoie qu'un numéro de colonne,
le serveur applique le coup, joue l'IA, et renvoie un plateau **sanitisé** (`1` = toi, `2` = IA).
Aucune persistance — la partie est éphémère (éviction après 30 min d'inactivité).

| Méthode | Endpoint | Body | Réponse `200` |
|---|---|---|---|
| POST | `/api/play/start` | – | `{ state }` (nouvelle partie, pose/rafraîchit le cookie) |
| GET | `/api/play/state` | – | `{ state }` |
| POST | `/api/play/move` | `{ "col": 0 }` (entier 0..6) | `{ state, aiMove }` |
| POST | `/api/play/reset` | – | `{ state }` (identique à `start`) |

`aiMove` = `{ "col", "row", "telemetry" }` — **absent** si le coup du joueur termine la partie.

Forme du `state` (vue publique) :
```json
{
  "board": [[0,0,0,0,0,0,0], "...6 lignes × 7 colonnes, 0=vide, 1=toi, 2=IA"],
  "currentPlayer": 1,
  "status": "in_progress",
  "winner": null,
  "isDraw": false,
  "winningLine": null
}
```
- `currentPlayer` : `1` = ton tour, `2` = l'IA calcule.
- `status` : `"in_progress" | "finished" | "abandoned"`.
- `winner` : `1 | 2 | null` (null = en cours ou nul).
- `winningLine` : les 4 cases `[row, col]` de la ligne gagnante (pour surligner), sinon `null`.

Erreurs JSON `{ "error": "<CODE>", "message": "..." }` :
`400 INVALID_BODY` / `400 INVALID_COL` / `400 COL_FULL` / `401 NO_SESSION` /
`410 GAME_OVER` / `410 NOT_YOUR_TURN` / `500 INTERNAL`.

### B) Jeu connecté (1v1 & IA) — `/api/games/*` + Socket.io

Auth requise. L'état est persisté en DB **et** tenu en mémoire par le serveur (autorité).
**On joue via Socket.io** (cf. [Socket.io](#socketio)) ; le REST sert à créer/récupérer.

#### `POST /api/games/ai` — créer une partie vs IA (sans lobby)

Body (optionnels) :
```json
{ "difficulty": "medium", "timePerPlayerSeconds": 300 }
```
Défauts : `difficulty="medium"` (`easy|medium|hard`), `timePerPlayerSeconds=300` (`300|600|3600`).
Réponse `201` : `{ "gameId": 42 }`. Ensuite : socket `game:join` puis `game:move` (l'IA répond seule).
Erreurs : `400` si le temps est invalide.

#### `GET /api/games/:id` — récupérer l'état d'une partie (reload)

Doit être l'un des 2 joueurs. Réponse `200` : `{ game, state }` — `game` = ligne DB,
`state` = snapshot live si la partie est encore active en mémoire, sinon `null`.
Erreurs : `404` introuvable / `403` pas dans la partie.

---

## Socket.io

### Se connecter

Côté client :
```ts
import { io } from "socket.io-client";

const socket = io("http://localhost:3000", {
  withCredentials: true,   // envoie le cookie auth_token
});
```

Le serveur lit le cookie au handshake, vérifie le JWT et accepte la connexion. Sinon : erreur `connect_error`.

À la connexion, l'user rejoint automatiquement la room `user:<id>` (utilisée pour le push ciblé).

---

### Events serveur → client (S→C)

| Event | Quand | Payload |
|---|---|---|
| `user:online` | Un ami se connecte | `{ userId }` |
| `user:offline` | Un ami se déconnecte | `{ userId }` |
| `chat:message` | On reçoit ou on envoie un message (echo) | `{ id, senderId, receiverId, content, createdAt }` |
| `chat:typing` | L'autre tape un message | `{ from }` |
| `notification:new` | Une nouvelle notif arrive | objet notification complet (id, type, content, ...) |

---

### Events client → serveur (C→S)

| Event | Payload | Effet |
|---|---|---|
| `chat:send` | `{ receiverId, content }` | Persist en DB → push `chat:message` au destinataire + echo à l'envoyeur + push `notification:new`. Rate limit 10/5s. Droppé si blocage. |
| `chat:typing` | `{ receiverId }` | Forward `chat:typing` au destinataire. |

---

### Lobby (Socket.io)

Permet de suivre l'état d'un lobby en temps réel pendant que les joueurs rejoignent.

| Sens | Event | Payload | Effet |
|---|---|---|---|
| C→S | `lobby:join` | `{ lobbyId }` | Rejoint la room `lobby:<id>` et déclenche un `lobby:update`. |
| C→S | `lobby:leave` | `{ lobbyId }` | Quitte la room (ne quitte **pas** le lobby côté DB — pour ça, `POST /api/lobbies/:id/leave`). |
| S→C | `lobby:update` | `{ lobby }` | Nouvel état du lobby. Émis aussi par les routes REST join/leave/start. |

---

### Jeu (Socket.io)

Le cœur du temps réel. **C'est ici qu'on joue** (mode connecté B). Le serveur est autoritaire :
le client envoie une intention (colonne), le serveur valide, applique, persiste et broadcaste.

**Flux 1v1** : créer le lobby (REST) → l'autre `join` → le créateur `start` (REST) → les 2
reçoivent `game:start { gameId }` → chacun émet `game:join { gameId }` → on joue via `game:move`.
**Flux IA connecté** : `POST /api/games/ai` → `gameId` → `game:join` → `game:move` (l'IA répond seule).

Events client → serveur (C→S) :

| Event | Payload | Effet |
|---|---|---|
| `game:join` | `{ gameId }` | Rejoint la room `game:<id>` et reçoit `game:state`. Ignoré si on n'est pas un joueur de la partie. |
| `game:move` | `{ gameId, col }` | Joue un coup (validé serveur). En cas d'échec → `game:error`. |
| `game:surrender` | `{ gameId }` | Abandon manuel : l'adversaire gagne. |

Events serveur → client (S→C) :

| Event | Payload | Quand |
|---|---|---|
| `game:start` | `{ gameId }` | Émis aux 2 joueurs (rooms `user:<id>`) quand le créateur lance le lobby. Signal pour faire `game:join`. |
| `game:state` | `{ gameId, state }` | Après chaque coup (état complet, voir ci-dessous). |
| `game:timer` | `{ gameId, timerP1, timerP2 }` | Tick chaque seconde : secondes restantes par joueur. Seul le joueur actif décompte (chess-style). |
| `game:over` | `{ gameId, winner, winnerUserId, status }` | Fin de partie. `winner` : `1\|2\|null` (null = nul). `status` : `"finished" \| "abandoned"`. |
| `game:error` | `{ gameId, error }` | Coup rejeté. `error` ∈ `"not your turn"`, `"invalid move"`, `"game not active"`, `"not a player"`, `"game not found"`. |

Forme du `state` (mode connecté) :
```json
{
  "board": [[0,0,0,0,0,0,0], "...6 lignes × 7 colonnes, 0=vide, 1=joueur 1, 2=joueur 2"],
  "currentPlayer": 1,
  "players": { "1": 12, "2": 34 },
  "status": "in_progress",
  "winner": null,
  "timerP1": 300,
  "timerP2": 300,
  "moveNumber": 0
}
```
- `currentPlayer` / `winner` sont des **slots** (`1`/`2`), pas des userId.
- `players` mappe slot → userId (`"2": null` si l'adversaire est l'IA).
- Nul = `status: "finished"` + `winner: null`.

> ⚠️ **Forme différente du mode anonyme `/api/play`** : ici pas de `isDraw` ni `winningLine`,
> mais présence de `players`, `timerP1`/`timerP2` et `moveNumber`.

**Déconnexion / reconnexion** : à la perte de socket, le serveur lance une **grâce de 60 s**
avant de déclarer l'abandon. Si le joueur revient dans la fenêtre, l'abandon est annulé. Au
retour, refaire `game:join` pour récupérer l'état (ou `GET /api/games/:id`).

---

## Codes d'erreur

| Code | Sens |
|---|---|
| `200` | OK |
| `201` | Created (signup, friend request envoyée, etc.) |
| `400` | Bad Request : champs manquants ou invalides |
| `401` | Unauthorized : pas connecté ou JWT invalide |
| `403` | Forbidden : blocage en cours |
| `404` | Not Found : ressource inexistante |
| `409` | Conflict : doublon (email, username, amitié déjà existante) |
| `500` | Server Error : bug, regarder les logs |

Tous les codes d'erreur retournent `{ "error": "message lisible" }`.
