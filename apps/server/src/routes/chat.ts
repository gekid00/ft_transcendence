// Routes chat REST. L'envoi temps réel (chat:send, chat:message, chat:typing) +
// le rate limiting vivent côté Socket.io dans socket/chat.ts.
//
// GET /api/chat              — liste des conversations (1 entrée par contact, avec dernier message)
// GET /api/chat/:userId      — historique des messages avec un user (paginé)

import type { FastifyInstance } from "fastify";
import { and, desc, eq, or } from "drizzle-orm";
import { db } from "../db/client.js";
import { chatMessages, users, blockedUsers, friendships } from "../db/schema.js";
import { requireAuth } from "../auth/middleware.js";
import { chatHistorySchema, chatPaginationSchema } from "../schemas/chat.js";

export async function chatRoutes(app: FastifyInstance) {
  app.get(
    "/chat",
    { preHandler: requireAuth },
    async (request, reply) => {
      const me = request.userId!;

      // Récupère tous les messages où je suis impliqué (envoyeur OU receveur).
      // Triés du + récent au + ancien pour qu'on puisse facilement garder le dernier par contact.
      const allMessages = await db
        .select()
        .from(chatMessages)
        .where(or(eq(chatMessages.senderId, me), eq(chatMessages.receiverId, me)))
        .orderBy(desc(chatMessages.createdAt));

      // Récupère les users bloqués (par moi OU qui m'ont bloqué) pour les exclure.
      const blocks = await db
        .select()
        .from(blockedUsers)
        .where(or(eq(blockedUsers.userId, me), eq(blockedUsers.blockedUserId, me)));
      const blockedIds = new Set<number>();
      for (const b of blocks) {
        blockedIds.add(b.userId === me ? b.blockedUserId : b.userId);
      }

      // Construit la liste des conversations : 1 entrée par contact, avec son dernier message.
      const conversationsByContact = new Map<
        number,
        { lastMessage: string; lastMessageAt: Date }
      >();
      for (const msg of allMessages) {
        const contactId = msg.senderId === me ? msg.receiverId : msg.senderId;
        if (blockedIds.has(contactId)) continue;
        if (!conversationsByContact.has(contactId)) {
          conversationsByContact.set(contactId, {
            lastMessage: msg.content,
            lastMessageAt: msg.createdAt,
          });
        }
      }

      // Enrichit avec les infos publiques de chaque contact.
      const contactIds = Array.from(conversationsByContact.keys());
      if (contactIds.length === 0) return reply.send([]);

      const contacts = await db
        .select({
          id: users.id,
          username: users.username,
          avatarUrl: users.avatarUrl,
          status: users.status,
        })
        .from(users)
        .where(or(...contactIds.map((id) => eq(users.id, id))));

      const result = contacts.map((c) => ({
        ...c,
        ...conversationsByContact.get(c.id)!,
      }));
      // Re-tri par date du dernier message (le map a perdu l'ordre).
      result.sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());

      return reply.send(result);
    }
  );

  app.get<{ Params: { userId: string }; Querystring: { limit?: string; offset?: string } }>(
    "/chat/:userId",
    { preHandler: requireAuth, schema: { params: chatHistorySchema, querystring: chatPaginationSchema } },
    async (request, reply) => {
      const me = request.userId!;
      const contactId = Number(request.params.userId);
      if (isNaN(contactId)) return reply.code(400).send({ error: "Invalid userId" });

      // Pagination basique (défauts : 50 messages max, depuis le début).
      const limit = Math.min(Number(request.query.limit) || 50, 100);
      const offset = Number(request.query.offset) || 0;

      // Refuse si l'un a bloqué l'autre.
      const blocks = await db
        .select()
        .from(blockedUsers)
        .where(
          or(
            and(eq(blockedUsers.userId, me), eq(blockedUsers.blockedUserId, contactId)),
            and(eq(blockedUsers.userId, contactId), eq(blockedUsers.blockedUserId, me))
          )
        );
      if (blocks.length > 0) {
        return reply.code(403).send({ error: "Blocked relationship exists" });
      }

      // Vérifie qu'ils sont bien amis.
      const [friendship] = await db
        .select()
        .from(friendships)
        .where(
          and(
            eq(friendships.status, "accepted"),
            or(
              and(eq(friendships.userId, me), eq(friendships.friendId, contactId)),
              and(eq(friendships.userId, contactId), eq(friendships.friendId, me))
            )
          )
        );
      if (!friendship) {
        return reply.code(403).send({ error: "Vous devez être amis pour voir le chat" });
      }

      // Messages entre moi et contactId, peu importe le sens, triés du + récent au + ancien.
      const messages = await db
        .select()
        .from(chatMessages)
        .where(
          or(
            and(eq(chatMessages.senderId, me), eq(chatMessages.receiverId, contactId)),
            and(eq(chatMessages.senderId, contactId), eq(chatMessages.receiverId, me))
          )
        )
        .orderBy(desc(chatMessages.createdAt))
        .limit(limit)
        .offset(offset);

      return reply.send(messages);
    }
  );
}
