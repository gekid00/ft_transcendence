// Routes notifications (REST only — le push live Socket.io viendra avec B6).
//
// GET   /api/notifications              — liste de mes notifs (non-lues d'abord)
// GET   /api/notifications/unread-count — nombre de non-lues (pour le badge)
// PATCH /api/notifications/:id/read     — marque une notif comme lue
// PATCH /api/notifications/read-all     — marque toutes mes notifs comme lues

import type { FastifyInstance } from "fastify";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { notifications, users, games, friendships } from "../db/schema.js";
import { requireAuth } from "../auth/middleware.js";
import { notificationIdParamSchema } from "../schemas/notifications.js";

export async function notificationRoutes(app: FastifyInstance) {
  app.get(
    "/notifications",
    { preHandler: requireAuth },
    async (request, reply) => {
      // Non-lues d'abord (false < true), puis du + récent au + ancien.
      const rows = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, request.userId!))
        .orderBy(asc(notifications.read), desc(notifications.createdAt))
        .limit(50);

      // Collect all user IDs, game IDs, and friendship IDs to resolve in one query
      const userIdsToFetch = new Set<number>();
      const gameIdsToFetch = new Set<number>();
      const friendshipIdsToFetch = new Set<number>();
      for (const row of rows) {
        const content = row.content as any;
        if (content?.from?.id) {
          userIdsToFetch.add(Number(content.from.id));
        }
        if (row.type === "game_invite" || row.type === "game_finished") {
          if (content?.gameId) {
            gameIdsToFetch.add(Number(content.gameId));
          }
        }
        if (row.type === "friend_request") {
          if (content?.friendshipId) {
            friendshipIdsToFetch.add(Number(content.friendshipId));
          }
        }
      }

      const usersMap = new Map<number, { id: number; username: string; avatarUrl: string | null }>();
      if (userIdsToFetch.size > 0) {
        const fetchedUsers = await db
          .select({
            id: users.id,
            username: users.username,
            avatarUrl: users.avatarUrl,
          })
          .from(users)
          .where(inArray(users.id, Array.from(userIdsToFetch)));
        for (const u of fetchedUsers) {
          usersMap.set(u.id, u);
        }
      }

      const gamesMap = new Map<number, string>();
      if (gameIdsToFetch.size > 0) {
        const fetchedGames = await db
          .select({
            id: games.id,
            status: games.status,
          })
          .from(games)
          .where(inArray(games.id, Array.from(gameIdsToFetch)));
        for (const g of fetchedGames) {
          gamesMap.set(g.id, g.status);
        }
      }

      const friendshipsMap = new Map<number, string>();
      if (friendshipIdsToFetch.size > 0) {
        const fetchedFriendships = await db
          .select({
            id: friendships.id,
            status: friendships.status,
          })
          .from(friendships)
          .where(inArray(friendships.id, Array.from(friendshipIdsToFetch)));
        for (const f of fetchedFriendships) {
          friendshipsMap.set(f.id, f.status);
        }
      }

      // Enrich rows
      const enrichedRows = rows.map((row) => {
        const content = { ...(row.content as any) };
        if (content?.from?.id) {
          const u = usersMap.get(Number(content.from.id));
          if (u) {
            content.from = {
              ...content.from,
              username: u.username,
              avatarUrl: u.avatarUrl,
            };
          }
        }
        if (row.type === "game_invite" || row.type === "game_finished") {
          if (content?.gameId) {
            content.gameStatus = gamesMap.get(Number(content.gameId)) || "unknown";
          }
        }
        if (row.type === "friend_request") {
          if (content?.friendshipId) {
            const fId = Number(content.friendshipId);
            content.friendshipStatus = friendshipsMap.get(fId) || "declined";
          }
        }
        return {
          ...row,
          content,
        };
      });

      return reply.send(enrichedRows);
    }
  );

  app.get(
    "/notifications/unread-count",
    { preHandler: requireAuth },
    async (request, reply) => {
      // Juste un COUNT(*) sur les non-lues pour le badge du header.
      const [row] = await db
        .select({ count: count() })
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, request.userId!),
            eq(notifications.read, false)
          )
        );

      return reply.send({ count: row.count });
    }
  );

  app.patch<{ Params: { id: string } }>(
    "/notifications/:id/read",
    { preHandler: requireAuth, schema: { params: notificationIdParamSchema } },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (isNaN(id)) return reply.code(400).send({ error: "Invalid id" });

      // On vérifie que la notif appartient bien à l'user connecté (sinon il pourrait
      // marquer les notifs des autres comme lues).
      const result = await db
        .update(notifications)
        .set({ read: true })
        .where(
          and(eq(notifications.id, id), eq(notifications.userId, request.userId!))
        )
        .returning();

      if (result.length === 0) {
        return reply.code(404).send({ error: "Notification not found" });
      }

      return reply.send({ message: "Marked as read" });
    }
  );

  app.patch(
    "/notifications/read-all",
    { preHandler: requireAuth },
    async (request, reply) => {
      // Bulk update : toutes les notifs non-lues de l'user passent à read=true.
      await db
        .update(notifications)
        .set({ read: true })
        .where(
          and(
            eq(notifications.userId, request.userId!),
            eq(notifications.read, false)
          )
        );

      return reply.send({ message: "All marked as read" });
    }
  );

  app.delete(
    "/notifications",
    { preHandler: requireAuth },
    async (request, reply) => {
      await db
        .delete(notifications)
        .where(eq(notifications.userId, request.userId!));

      return reply.send({ message: "All notifications cleared" });
    }
  );
}
