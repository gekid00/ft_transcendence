// Construction de l'instance Fastify : plugins, routes, config CORS.
// La séparation construction/démarrage (cf. index.ts) permet de tester sans bind sur un port.

import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { validatorCompiler } from "@fastify/type-provider-zod";
import { authRoutes } from "./routes/auth.js";
import { userRoutes } from "./routes/users.js";
import { friendRoutes } from "./routes/friends.js";
import { chatRoutes } from "./routes/chat.js";
import { notificationRoutes } from "./routes/notifications.js";
import { lobbyRoutes } from "./routes/lobbies.js";
import { gameRoutes } from "./routes/games.js";
import { playRoutes } from "./routes/play.js";
import { leaderboardRoutes } from "./routes/leaderboard.js";
import { setupSocket } from "./socket/index.js";

// Dossier racine des uploads (avatars, etc.). Créé au démarrage si absent.
const UPLOADS_DIR = join(import.meta.dirname, "..", "uploads");

export async function buildServer() {
  const app = Fastify({
    logger: true,
  });

  // Zod schema validation — auto-validates request body/params/query.
  // Returns 400 with Zod error details on invalid input.
  app.setValidatorCompiler(validatorCompiler);

  // Crée le dossier d'uploads à la première exécution.
  await mkdir(join(UPLOADS_DIR, "avatars"), { recursive: true });

  // Lecture/écriture des cookies (utilisé par l'auth pour le JWT en HttpOnly).
  await app.register(cookie);

  // Autorise le frontend Astro à appeler le back depuis un autre origin.
  // credentials: true → le navigateur envoie les cookies cross-origin.
  await app.register(cors, {
    origin: process.env.FRONTEND_URL ?? "http://localhost:4321",
    credentials: true,
  });

  // Parse les uploads multipart/form-data (ex: upload d'avatar). Limite à 2 MB.
  await app.register(multipart, {
    limits: { fileSize: 2 * 1024 * 1024 },
  });

  // Support standard HTML form submissions (x-www-form-urlencoded) for logout.
  // We don't read the body for logout, so we can just return an empty object.
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (req, body, done) => {
      done(null, {});
    }
  );

  // Sert les fichiers uploadés (avatars) à l'URL /uploads/...
  await app.register(fastifyStatic, {
    root: UPLOADS_DIR,
    prefix: "/uploads/",
  });

  // Health check pour vérifier que le serveur tourne.
  app.get("/health", async () => {
    return { status: "ok" };
  });

  // Routes d'auth : /api/auth/signup, /login, /logout, /me, /42, /42/callback
  await app.register(authRoutes, { prefix: "/api/auth" });

  // Routes user : /api/users/:id, /search, /api/profile
  await app.register(userRoutes, { prefix: "/api" });

  // Routes amis : /api/friends, /requests, /request, /respond
  await app.register(friendRoutes, { prefix: "/api" });

  // Routes chat (REST only) : /api/chat, /api/chat/:userId
  await app.register(chatRoutes, { prefix: "/api" });

  // Routes notifications (REST only) : /api/notifications, /unread-count, /:id/read, /read-all
  await app.register(notificationRoutes, { prefix: "/api" });

  // Routes lobbies : /api/lobbies, /:id/join, /:id/leave, /:id/start
  await app.register(lobbyRoutes, { prefix: "/api" });

  // Routes games : /api/games/ai, /api/games/:id
  await app.register(gameRoutes, { prefix: "/api" });
  // Routes anonymous play (landing demo) : /api/play/start, /move, /state, /reset.
  // Server-authoritative game state, HttpOnly cookie session, in-memory store.
  await app.register(playRoutes, { prefix: "/api" });

  // Public top-N Elo leaderboard for the landing page. No auth.
  await app.register(leaderboardRoutes, { prefix: "/api" });

  // Setup Socket.io (auth + online/offline tracking + futurs events chat/game/notif).
  await setupSocket(app);

  return app;
}
