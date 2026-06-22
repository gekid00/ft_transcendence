// Routes lobbies (REST).
//
// GET  /api/lobbies          — liste les lobbies (filtres: ?mode=connect4&status=waiting&time=300)
// POST /api/lobbies          — crée un lobby, génère un code 6 caractères
// POST /api/lobbies/:id/join  — rejoint un lobby (public direct, privé avec { code } dans le body)
// POST /api/lobbies/:id/leave — quitte le lobby
// POST /api/lobbies/:id/start — démarre la partie (créateur seulement, 2 joueurs requis)

import type { FastifyInstance } from "fastify";
import { and, desc, eq, lt, or } from "drizzle-orm";
import { db } from "../db/client.js";
import { lobbies, games, users, friendships } from "../db/schema.js";
import { requireAuth } from "../auth/middleware.js";
import { gameManager } from "../game/gameManager.js";
import { broadcastLobbyUpdate } from "../socket/lobby.js";
import { sendNotification } from "../services/notification.js";
import {
  createLobbySchema,
  joinLobbySchema,
  lobbyListSchema,
  lobbyIdParamSchema,
} from "../schemas/lobbies.js";

function generateCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

async function uniqueCode(): Promise<string>
{
  // Réessaie jusqu'à trouver un code non utilisé (collision extrêmement rare).
  for (;;) {
    const code = generateCode();
    const existing = await db.select({ id: lobbies.id }).from(lobbies).where(eq(lobbies.code, code));
    if (existing.length === 0)
      return code;
  }
}

export async function lobbyRoutes(app: FastifyInstance) {
  // GET /api/lobbies — liste avec filtres optionnels
  app.get<{ Querystring: { mode?: string; status?: string; time?: string } }>(
    "/lobbies",
    { preHandler: requireAuth, schema: { querystring: lobbyListSchema } },
    async (request, reply) => {
      const { mode, status, time } = request.query;

    // Auto-expire old lobbies before listing
    const expiryTime = 10 * 60 * 1000;
    const cutoff = new Date(Date.now() - expiryTime);
    await db
      .update(lobbies)
      .set({ status: "closed" })
      .where(and(eq(lobbies.status, "waiting"), lt(lobbies.createdAt, cutoff)));

    const filters = [];
    if (mode) filters.push(eq(lobbies.mode, mode as "connect4" | "connect5"));
    if (status) filters.push(eq(lobbies.status, status as "waiting" | "in_progress" | "closed"));
    if (time) filters.push(eq(lobbies.timePerPlayerSeconds, parseInt(time)));

    const rows = await db
      .select()
      .from(lobbies)
      .where(filters.length ? and(...filters) : undefined);

    return reply.send(rows);
  });

  // GET /api/lobbies/:id — obtenir le détail et statut d'un lobby
  app.get<{ Params: { id: string } }>(
    "/lobbies/:id",
    { preHandler: requireAuth },
    async (request, reply) => {
      const lobbyId = parseInt(request.params.id);
      if (isNaN(lobbyId)) return reply.code(400).send({ error: "Lobby ID invalide" });

      let [lobby] = await db.select().from(lobbies).where(eq(lobbies.id, lobbyId));
      if (!lobby) return reply.status(404).send({ error: "Lobby introuvable" });

      // Check for expiration (10 minutes)
      const expiryTime = 10 * 60 * 1000;
      if (lobby.status === "waiting" && Date.now() - new Date(lobby.createdAt).getTime() > expiryTime) {
        [lobby] = await db
          .update(lobbies)
          .set({ status: "closed" })
          .where(eq(lobbies.id, lobbyId))
          .returning();
        await broadcastLobbyUpdate(app.io, lobbyId);
      }

      const lobbyData = {
        ...lobby,
        gameId: null as number | null,
      };

      if (lobby.status === "in_progress" && lobby.player2Id) {
        const [associatedGame] = await db
          .select({ id: games.id })
          .from(games)
          .where(
            and(
              eq(games.player1Id, lobby.creatorId),
              eq(games.player2Id, lobby.player2Id),
              eq(games.status, "in_progress")
            )
          )
          .orderBy(desc(games.startedAt))
          .limit(1);
        if (associatedGame) {
          lobbyData.gameId = associatedGame.id;
        }
      }

      return reply.send(lobbyData);
    }
  );

  // POST /api/lobbies/:id/decline — décliner un lobby
  app.post<{ Params: { id: string } }>(
    "/lobbies/:id/decline",
    { preHandler: requireAuth },
    async (request, reply) => {
      const lobbyId = parseInt(request.params.id);
      const [lobby] = await db.select().from(lobbies).where(eq(lobbies.id, lobbyId));
      if (!lobby) return reply.status(404).send({ error: "Lobby introuvable" });

      if (lobby.status !== "waiting") {
        return reply.status(400).send({ error: "Le lobby n'est plus en attente" });
      }

      const [updated] = await db
        .update(lobbies)
        .set({ status: "closed" })
        .where(eq(lobbies.id, lobbyId))
        .returning();

      await broadcastLobbyUpdate(app.io, lobbyId);
      return reply.send(updated);
    }
  );

  // POST /api/lobbies — créer un lobby
  app.post<{ Body: { isPublic: boolean; mode: "connect4" | "connect5"; timePerPlayerSeconds: number } }>(
    "/lobbies",
    { preHandler: requireAuth, schema: { body: createLobbySchema } },
    async (request, reply) => {
      const { isPublic, mode, timePerPlayerSeconds } = request.body;

      const code = await uniqueCode();

      const [lobby] = await db
        .insert(lobbies)
        .values({
          code,
          creatorId: request.userId!,
          isPublic,
          mode,
          timePerPlayerSeconds,
        })
        .returning();

      return reply.status(201).send(lobby);
    }
  );

  // POST /api/lobbies/:id/join — rejoindre un lobby
  app.post<{ Params: { id: string }; Body: { code?: string } }>(
    "/lobbies/:id/join",
    { preHandler: requireAuth, schema: { params: lobbyIdParamSchema, body: joinLobbySchema } },
    async (request, reply) => {
      const lobbyId = parseInt(request.params.id);
      const userId = request.userId!;

      let [lobby] = await db.select().from(lobbies).where(eq(lobbies.id, lobbyId));
      if (!lobby) return reply.status(404).send({ error: "Lobby introuvable" });

      // Check expiration before verifying status
      const expiryTime = 10 * 60 * 1000;
      if (lobby.status === "waiting" && Date.now() - new Date(lobby.createdAt).getTime() > expiryTime) {
        [lobby] = await db
          .update(lobbies)
          .set({ status: "closed" })
          .where(eq(lobbies.id, lobbyId))
          .returning();
        await broadcastLobbyUpdate(app.io, lobbyId);
      }

      if (lobby.status !== "waiting")
        return reply.status(400).send({ error: "Ce lobby n'accepte plus de joueurs" });
      if (lobby.player2Id !== null)
        return reply.status(400).send({ error: "Lobby déjà complet" });
      if (lobby.creatorId === userId)
        return reply.status(400).send({ error: "Vous êtes déjà dans ce lobby" });

      // Lobby privé : vérifier le code et l'amitié
      if (!lobby.isPublic) {
        if (!request.body?.code || request.body.code !== lobby.code) {
          return reply.status(403).send({ error: "Code invalide" });
        }

        // Vérifie qu'ils sont bien amis.
        const [friendship] = await db
          .select()
          .from(friendships)
          .where(
            and(
              eq(friendships.status, "accepted"),
              or(
                and(eq(friendships.userId, lobby.creatorId), eq(friendships.friendId, userId)),
                and(eq(friendships.userId, userId), eq(friendships.friendId, lobby.creatorId))
              )
            )
          );
        if (!friendship) {
          return reply.status(403).send({ error: "Vous devez être amis avec le créateur pour rejoindre un lobby privé" });
        }
      }

      const [updated] = await db
        .update(lobbies)
        .set({ player2Id: userId, status: !lobby.isPublic ? "in_progress" : "waiting" })
        .where(eq(lobbies.id, lobbyId))
        .returning();

      if (!lobby.isPublic) {
        // Crée la partie en DB
        const [game] = await db
          .insert(games)
          .values({
            player1Id: lobby.creatorId,
            player2Id: userId,
            isAiOpponent: false,
            mode: lobby.mode,
            timePerPlayerSeconds: lobby.timePerPlayerSeconds,
            status: "in_progress",
            startedAt: new Date(),
          })
          .returning();

        // Enregistre la partie active en memoire (autorite serveur).
        gameManager.createGame({
          gameId: game.id,
          player1Id: lobby.creatorId,
          player2Id: userId,
          timePerPlayerSeconds: lobby.timePerPlayerSeconds,
          isAi: false,
        });

        // Notifie les 2 joueurs via leur room personnelle qu'ils doivent rejoindre la partie.
        app.io.to(`user:${lobby.creatorId}`).emit("game:start", { gameId: game.id });
        app.io.to(`user:${userId}`).emit("game:start", { gameId: game.id });

        await broadcastLobbyUpdate(app.io, lobbyId);

        // Envoyer une notification game_invite au créateur (User A)
        const [meUser] = await db.select().from(users).where(eq(users.id, userId));
        await sendNotification(lobby.creatorId, "game_invite", {
          gameId: game.id,
          lobbyId: lobby.id,
          from: {
            id: userId,
            username: meUser.username,
            avatarUrl: meUser.avatarUrl,
          },
        });

        // Envoyer une notification game_invite à l'invité (User B, qui accepte)
        const [creatorUser] = await db.select().from(users).where(eq(users.id, lobby.creatorId));
        await sendNotification(userId, "game_invite", {
          gameId: game.id,
          lobbyId: lobby.id,
          from: {
            id: lobby.creatorId,
            username: creatorUser.username,
            avatarUrl: creatorUser.avatarUrl,
          },
        });

        return reply.send({ ...updated, gameId: game.id });
      } else {
        await broadcastLobbyUpdate(app.io, lobbyId);
      }

      return reply.send(updated);
    }
  );

  // POST /api/lobbies/:id/leave — quitter un lobby
  app.post<{ Params: { id: string } }>(
    "/lobbies/:id/leave",
    { preHandler: requireAuth, schema: { params: lobbyIdParamSchema } },
    async (request, reply) => {
      const lobbyId = parseInt(request.params.id);
      const userId = request.userId!;

      const [lobby] = await db.select().from(lobbies).where(eq(lobbies.id, lobbyId));
      if (!lobby) return reply.status(404).send({ error: "Lobby introuvable" });
      if (lobby.status !== "waiting") return reply.status(400).send({ error: "Impossible de quitter un lobby en cours" });

      if (lobby.creatorId === userId) {
        // Le créateur quitte → fermeture du lobby
        await db.update(lobbies).set({ status: "closed" }).where(eq(lobbies.id, lobbyId));
        await broadcastLobbyUpdate(app.io, lobbyId);
        return reply.send({ message: "Lobby fermé" });
      }

      if (lobby.player2Id === userId) {
        await db.update(lobbies).set({ player2Id: null }).where(eq(lobbies.id, lobbyId));
        await broadcastLobbyUpdate(app.io, lobbyId);
        return reply.send({ message: "Vous avez quitté le lobby" });
      }

      return reply.status(403).send({ error: "Vous n'êtes pas dans ce lobby" });
    }
  );

  // POST /api/lobbies/:id/start — démarrer la partie
  app.post<{ Params: { id: string } }>(
    "/lobbies/:id/start",
    { preHandler: requireAuth, schema: { params: lobbyIdParamSchema } },
    async (request, reply) => {
      const lobbyId = parseInt(request.params.id);
      const userId = request.userId!;

      const [lobby] = await db.select().from(lobbies).where(eq(lobbies.id, lobbyId));
      if (!lobby) return reply.status(404).send({ error: "Lobby introuvable" });
      if (lobby.creatorId !== userId) return reply.status(403).send({ error: "Seul le créateur peut démarrer la partie" });
      if (lobby.status !== "waiting") return reply.status(400).send({ error: "Le lobby n'est plus en attente" });
      if (!lobby.player2Id) return reply.status(400).send({ error: "Il faut 2 joueurs pour démarrer" });

      // Crée la partie en DB
      const [game] = await db
        .insert(games)
        .values({
          player1Id: lobby.creatorId,
          player2Id: lobby.player2Id,
          isAiOpponent: false,
          mode: lobby.mode,
          timePerPlayerSeconds: lobby.timePerPlayerSeconds,
          status: "in_progress",
          startedAt: new Date(),
        })
        .returning();

      // Ferme le lobby
      await db.update(lobbies).set({ status: "in_progress" }).where(eq(lobbies.id, lobbyId));
      await broadcastLobbyUpdate(app.io, lobbyId);

      // Enregistre la partie active en memoire (autorite serveur).
      gameManager.createGame({
        gameId: game.id,
        player1Id: lobby.creatorId,
        player2Id: lobby.player2Id,
        timePerPlayerSeconds: lobby.timePerPlayerSeconds,
        isAi: false,
      });

      // Notifie les 2 joueurs via leur room personnelle qu'ils doivent rejoindre la partie.
      app.io.to(`user:${lobby.creatorId}`).emit("game:start", { gameId: game.id });
      app.io.to(`user:${lobby.player2Id}`).emit("game:start", { gameId: game.id });

      return reply.status(201).send({ gameId: game.id });
    }
  );
}
