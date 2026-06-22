// Routes games (REST).
//
// POST /api/games/ai  -> cree une partie contre l'IA (pas de lobby requis)
// GET  /api/games/:id -> recupere l'etat d'une partie (pour reload depuis le front)

import type { FastifyInstance } from "fastify";
import { eq, ne, and, or } from "drizzle-orm";
import { db } from "../db/client.js";
import { games, users } from "../db/schema.js";
import { requireAuth } from "../auth/middleware.js";
import { gameManager } from "../game/gameManager.js";
import { aiGameSchema, gameIdParamSchema } from "../schemas/games.js";

export async function gameRoutes(app: FastifyInstance)
{
  // POST /api/games/ai
  app.post<{ Body: { difficulty?: "easy" | "medium" | "hard"; timePerPlayerSeconds?: number } }>(
    "/games/ai",
    { preHandler: requireAuth, schema: { body: aiGameSchema } },
    async (request, reply) => {
      const userId = request.userId!;
      const { difficulty, timePerPlayerSeconds } = request.body;

      const [game] = await db.insert(games).values({
        player1Id: userId,
        player2Id: null,
        isAiOpponent: true,
        aiDifficulty: difficulty,
        timePerPlayerSeconds,
        status: "in_progress",
        startedAt: new Date(),
      }).returning();

      gameManager.createGame({
        gameId: game.id,
        player1Id: userId,
        player2Id: null,
        timePerPlayerSeconds,
        isAi: true,
        aiDifficulty: difficulty,
      });

      return reply.status(201).send({ gameId: game.id });
    }
  );

  // POST /api/games/test-multiplayer
  app.post<{ Body: { timePerPlayerSeconds?: number } }>(
    "/games/test-multiplayer",
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.userId!;
      let { timePerPlayerSeconds = 180 } = request.body ?? {};

      const validTimes = [180, 600, 3600];
      if (!validTimes.includes(timePerPlayerSeconds)) {
        timePerPlayerSeconds = 180;
      }

      // Find another user in the DB
      const otherUsers = await db
        .select()
        .from(users)
        .where(ne(users.id, userId))
        .limit(1);

      const player2Id = otherUsers[0]?.id ?? userId; // Fallback to playing against self if no other user exists

      const [game] = await db.insert(games).values({
        player1Id: userId,
        player2Id,
        isAiOpponent: false,
        timePerPlayerSeconds,
        status: "in_progress",
        startedAt: new Date(),
      }).returning();

      gameManager.createGame({
        gameId: game.id,
        player1Id: userId,
        player2Id,
        timePerPlayerSeconds,
        isAi: false,
      });

      return reply.status(201).send({ gameId: game.id });
    }
  );

  // GET /api/games/active
  app.get(
    "/games/active",
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.userId!;
      
      const activeDbGames = await db
        .select()
        .from(games)
        .where(
          and(
            eq(games.status, "in_progress"),
            or(
              eq(games.player1Id, userId),
              eq(games.player2Id, userId)
            )
          )
        );

      const results = [];
      for (const game of activeDbGames) {
        const active = await gameManager.getOrRestore(game.id);
        if (!active) continue;

        if (active.state.status !== "in_progress") {
          continue;
        }

        const slot = active.state.slotForUser(userId);
        if (slot === null) continue;

        const opponentId = game.player1Id === userId ? game.player2Id : game.player1Id;
        let opponent: {
          username: string;
          initial: string;
          rating: number | null;
          isAi: boolean;
          aiDifficulty?: string;
          gamesPlayed?: number;
        } = {
          username: `AI · ${game.aiDifficulty || "medium"}`,
          initial: "✦",
          rating: null,
          isAi: true,
          aiDifficulty: game.aiDifficulty || "medium",
        };

        if (opponentId !== null) {
          const [oppUser] = await db
            .select({ username: users.username, rating: users.rating, gamesPlayed: users.gamesPlayed })
            .from(users)
            .where(eq(users.id, opponentId));
          if (oppUser) {
            opponent = {
              username: oppUser.username,
              initial: oppUser.username.charAt(0).toUpperCase(),
              rating: oppUser.rating,
              isAi: false,
              gamesPlayed: oppUser.gamesPlayed,
            };
          }
        }

        const yourTurn = slot === active.state.currentPlayer;

        results.push({
          id: game.id,
          yourTurn,
          moves: active.state.moveNumber,
          timerP1: active.state.timerP1,
          timerP2: active.state.timerP2,
          userSlot: slot,
          timeControl: game.timePerPlayerSeconds === 180 ? "Bullet" : game.timePerPlayerSeconds === 600 ? "Blitz" : "Daily",
          opponent,
        });
      }

      return reply.send(results);
    }
  );

  // GET /api/games/:id
  app.get<{ Params: { id: string } }>(
    "/games/:id",
    { preHandler: requireAuth, schema: { params: gameIdParamSchema } },
    async (request, reply) => {
      const gameId = parseInt(request.params.id);
      const userId = request.userId!;

      const [game] = await db.select().from(games).where(eq(games.id, gameId));
      if (!game) return reply.status(404).send({ error: "Partie introuvable" });
      if (game.player1Id !== userId && game.player2Id !== userId)
        return reply.status(403).send({ error: "Vous n'etes pas dans cette partie" });

      // Si la partie est encore en memoire, renvoyer l'etat live.
      const active = await gameManager.getOrRestore(gameId);
      if (active) return reply.send({ game, state: active.state.getState() });

      return reply.send({ game, state: null });
    }
  );
}
