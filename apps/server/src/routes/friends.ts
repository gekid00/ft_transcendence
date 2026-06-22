// Routes amis + blocage. Toutes les routes ici nécessitent d'être connecté.
//
// GET    /api/friends           — liste des amis acceptés
// GET    /api/friends/requests  — demandes d'amis reçues (en attente)
// POST   /api/friends/request   — envoie une demande d'ami
// POST   /api/friends/respond   — accepte ou refuse une demande reçue
// DELETE /api/friends/:id       — supprime un ami (ou annule une demande)
// POST   /api/block             — bloque un user (supprime aussi l'amitié si existante)
// DELETE /api/block/:id         — débloque un user

import type { FastifyInstance } from "fastify";
import { and, eq, or, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { friendships, users, blockedUsers, games, notifications } from "../db/schema.js";
import { requireAuth } from "../auth/middleware.js";
import { sendNotification } from "../services/notification.js";
import { friendRequestSchema, friendRespondSchema, blockSchema } from "../schemas/friends.js";
import { idParamSchema } from "../schemas/common.js";

export async function friendRoutes(app: FastifyInstance) {
  app.get(
    "/friends",
    { preHandler: requireAuth },
    async (request, reply) => {
      // Une amitié est acceptée et peut avoir été initiée par moi ou par l'autre.
      // On joint avec users pour avoir directement les infos de l'ami.
      const me = request.userId!;
      const rows = await db
        .select({
          friendshipId: friendships.id,
          id: users.id,
          username: users.username,
          avatarUrl: users.avatarUrl,
          status: users.status,
          rating: users.rating,
        })
        .from(friendships)
        .innerJoin(
          users,
          // L'ami est la personne qui n'est PAS moi dans la ligne friendships.
          or(
            and(eq(friendships.userId, me), eq(users.id, friendships.friendId)),
            and(eq(friendships.friendId, me), eq(users.id, friendships.userId))
          )
        )
        .where(eq(friendships.status, "accepted"));

      const enrichedRows = [];
      for (const row of rows) {
        let currentGameId: number | null = null;
        if (row.status === "in_game") {
          const [activeGame] = await db
            .select({ id: games.id })
            .from(games)
            .where(
              and(
                eq(games.status, "in_progress"),
                or(eq(games.player1Id, row.id), eq(games.player2Id, row.id))
              )
            )
            .limit(1);
          currentGameId = activeGame?.id ?? null;
        }

        enrichedRows.push({
          ...row,
          currentGameId,
        });
      }

      return reply.send(enrichedRows);
    }
  );

  app.get(
    "/friends/requests",
    { preHandler: requireAuth },
    async (request, reply) => {
      // Demandes reçues : friendId = moi, status = pending.
      const me = request.userId!;
      const rows = await db
        .select({
          friendshipId: friendships.id,
          id: users.id,
          username: users.username,
          avatarUrl: users.avatarUrl,
        })
        .from(friendships)
        .innerJoin(users, eq(users.id, friendships.userId))
        .where(and(eq(friendships.friendId, me), eq(friendships.status, "pending")));

      return reply.send(rows);
    }
  );

  app.get(
    "/friends/requests/sent",
    { preHandler: requireAuth },
    async (request, reply) => {
      // Demandes envoyées : userId = moi, status = pending.
      const me = request.userId!;
      const rows = await db
        .select({
          friendshipId: friendships.id,
          id: users.id,
          username: users.username,
          avatarUrl: users.avatarUrl,
        })
        .from(friendships)
        .innerJoin(users, eq(users.id, friendships.friendId))
        .where(and(eq(friendships.userId, me), eq(friendships.status, "pending")));

      return reply.send(rows);
    }
  );

  app.post<{ Body: { userId: number } }>(
    "/friends/request",
    { preHandler: requireAuth, schema: { body: friendRequestSchema } },
    async (request, reply) => {
      const me = request.userId!;
      const target = request.body.userId;

      // Validations basiques.
      if (!target) return reply.code(400).send({ error: "Missing userId" });
      if (target === me) return reply.code(400).send({ error: "Cannot friend yourself" });

      const [targetUser] = await db.select().from(users).where(eq(users.id, target));
      if (!targetUser) return reply.code(404).send({ error: "User not found" });

      // Refuse si une des 2 personnes a bloqué l'autre.
      const blocks = await db
        .select()
        .from(blockedUsers)
        .where(
          or(
            and(eq(blockedUsers.userId, me), eq(blockedUsers.blockedUserId, target)),
            and(eq(blockedUsers.userId, target), eq(blockedUsers.blockedUserId, me))
          )
        );
      if (blocks.length > 0) {
        return reply.code(403).send({ error: "Blocked relationship exists" });
      }

      // Refuse si une amitié (peu importe le sens) existe déjà.
      const existing = await db
        .select()
        .from(friendships)
        .where(
          or(
            and(eq(friendships.userId, me), eq(friendships.friendId, target)),
            and(eq(friendships.userId, target), eq(friendships.friendId, me))
          )
        );
      if (existing.length > 0) {
        return reply.code(409).send({ error: "Friendship already exists" });
      }

      const [created] = await db
        .insert(friendships)
        .values({ userId: me, friendId: target, status: "pending" })
        .returning();

      // Notif pour le target : "X t'a envoyé une demande d'ami".
      const [meUser] = await db.select().from(users).where(eq(users.id, me));
      await sendNotification(target, "friend_request", {
        from: { id: me, username: meUser.username, avatarUrl: meUser.avatarUrl },
        friendshipId: created.id,
      });

      return reply.code(201).send({ id: created.id, status: created.status });
    }
  );

  app.post<{ Body: { friendshipId: number; accept: boolean } }>(
    "/friends/respond",
    { preHandler: requireAuth, schema: { body: friendRespondSchema } },
    async (request, reply) => {
      const me = request.userId!;
      const { friendshipId, accept } = request.body;
      if (!friendshipId || typeof accept !== "boolean") {
        return reply.code(400).send({ error: "Missing fields" });
      }

      // La demande doit exister, m'être adressée, et être pending.
      const [req] = await db.select().from(friendships).where(eq(friendships.id, friendshipId));
      if (!req || req.friendId !== me || req.status !== "pending") {
        return reply.code(404).send({ error: "Request not found" });
      }

      // Mark corresponding friend request notification as read in the database
      await db
        .update(notifications)
        .set({ read: true })
        .where(
          and(
            eq(notifications.userId, me),
            eq(notifications.type, "friend_request"),
            sql`${notifications.content}->>'friendshipId' = ${friendshipId.toString()}`
          )
        );

      if (accept) {
        await db
          .update(friendships)
          .set({ status: "accepted" })
          .where(eq(friendships.id, friendshipId));

        // Notif pour celui qui avait envoyé la demande : "X a accepté ton ami".
        const [meUser] = await db.select().from(users).where(eq(users.id, me));
        await sendNotification(req.userId, "friend_accepted", {
          from: { id: me, username: meUser.username, avatarUrl: meUser.avatarUrl },
        });

        return reply.send({ status: "accepted" });
      } else {
        // Refus = on supprime la ligne (pas d'historique des refus).
        await db.delete(friendships).where(eq(friendships.id, friendshipId));
        return reply.send({ status: "declined" });
      }
    }
  );

  app.delete<{ Params: { id: string } }>(
    "/friends/:id",
    { preHandler: requireAuth, schema: { params: idParamSchema } },
    async (request, reply) => {
      const me = request.userId!;
      const id = Number(request.params.id);
      if (isNaN(id)) return reply.code(400).send({ error: "Invalid id" });

      // On peut supprimer une amitié seulement si on est dedans (peu importe le côté).
      const [row] = await db.select().from(friendships).where(eq(friendships.id, id));
      if (!row || (row.userId !== me && row.friendId !== me)) {
        return reply.code(404).send({ error: "Friendship not found" });
      }

      await db.delete(friendships).where(eq(friendships.id, id));
      return reply.send({ message: "Friendship removed" });
    }
  );

  app.delete<{ Params: { userId: string } }>(
    "/friends/user/:userId",
    { preHandler: requireAuth },
    async (request, reply) => {
      const me = request.userId!;
      const target = Number(request.params.userId);
      if (isNaN(target)) return reply.code(400).send({ error: "Invalid userId" });

      const [row] = await db
        .select()
        .from(friendships)
        .where(
          or(
            and(eq(friendships.userId, me), eq(friendships.friendId, target)),
            and(eq(friendships.userId, target), eq(friendships.friendId, me))
          )
        );

      if (!row) {
        return reply.code(404).send({ error: "Friendship not found" });
      }

      await db.delete(friendships).where(eq(friendships.id, row.id));
      return reply.send({ message: "Friendship removed" });
    }
  );

  app.post<{ Body: { userId: number } }>(
    "/block",
    { preHandler: requireAuth, schema: { body: blockSchema } },
    async (request, reply) => {
      const me = request.userId!;
      const target = request.body.userId;

      if (!target) return reply.code(400).send({ error: "Missing userId" });
      if (target === me) return reply.code(400).send({ error: "Cannot block yourself" });

      const [targetUser] = await db.select().from(users).where(eq(users.id, target));
      if (!targetUser) return reply.code(404).send({ error: "User not found" });

      // Idempotent : si on a déjà bloqué, on renvoie OK sans recréer.
      const existing = await db
        .select()
        .from(blockedUsers)
        .where(and(eq(blockedUsers.userId, me), eq(blockedUsers.blockedUserId, target)));
      if (existing.length > 0) {
        return reply.send({ message: "Already blocked" });
      }

      // Bloquer = supprimer toute amitié existante entre les 2 users.
      await db
        .delete(friendships)
        .where(
          or(
            and(eq(friendships.userId, me), eq(friendships.friendId, target)),
            and(eq(friendships.userId, target), eq(friendships.friendId, me))
          )
        );

      await db.insert(blockedUsers).values({ userId: me, blockedUserId: target });

      return reply.code(201).send({ message: "User blocked" });
    }
  );

  app.delete<{ Params: { id: string } }>(
    "/block/:id",
    { preHandler: requireAuth },
    async (request, reply) => {
      const me = request.userId!;
      const target = Number(request.params.id);
      if (isNaN(target)) return reply.code(400).send({ error: "Invalid id" });

      // L'id en path = l'userId de la personne à débloquer (pas l'id de la ligne block).
      await db
        .delete(blockedUsers)
        .where(and(eq(blockedUsers.userId, me), eq(blockedUsers.blockedUserId, target)));

      return reply.send({ message: "User unblocked" });
    }
  );
}
