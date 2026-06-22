// Events Socket.io pour le chat en temps réel.
//
// chat:send    (C→S) : { receiverId, content } — envoyer un message
// chat:message (S→C) : reçu par le destinataire ET renvoyé en écho à l'envoyeur
// chat:typing  (C→S) : { receiverId } — signaler que je tape
// chat:typing  (S→C) : { from } — l'autre voit "X est en train d'écrire"
//
// Rate limit : 10 messages max / 5s par socket.
// Block check : message droppé silencieusement si l'un a bloqué l'autre.

import type { Server, Socket } from "socket.io";
import { and, eq, or } from "drizzle-orm";
import { db } from "../db/client.js";
import { chatMessages, blockedUsers, friendships } from "../db/schema.js";
import { sendNotification } from "../services/notification.js";

const RATE_WINDOW_MS = 5000;
const RATE_LIMIT = 10;
const rateMap = new Map<string, { count: number; resetAt: number }>();

interface ChatSendData {
  receiverId: number;
  content: string;
}

interface ChatTypingData {
  receiverId: number;
}

export function registerChatHandlers(socket: Socket, io: Server) {
  socket.on("chat:send", async (data: ChatSendData) => {
    const me = socket.data.userId;
    if (!data?.receiverId || !data?.content?.trim()) return;
    const receiverId = Number(data.receiverId);
    if (isNaN(receiverId)) return;
    if (data.content.length > 1000) return;
    if (!checkRate(socket.id)) return;

    // Refuse si l'un a bloqué l'autre.
    const blocks = await db
      .select()
      .from(blockedUsers)
      .where(
        or(
          and(eq(blockedUsers.userId, me), eq(blockedUsers.blockedUserId, receiverId)),
          and(eq(blockedUsers.userId, receiverId), eq(blockedUsers.blockedUserId, me))
        )
      );
    if (blocks.length > 0) return;

    // Vérifie qu'ils sont bien amis.
    const [friendship] = await db
      .select()
      .from(friendships)
      .where(
        and(
          eq(friendships.status, "accepted"),
          or(
            and(eq(friendships.userId, me), eq(friendships.friendId, receiverId)),
            and(eq(friendships.userId, receiverId), eq(friendships.friendId, me))
          )
        )
      );
    if (!friendship) return;

    // Persiste le message en DB.
    const [msg] = await db
      .insert(chatMessages)
      .values({
        senderId: me,
        receiverId: receiverId,
        content: data.content,
      })
      .returning();

    // Pousse vers le destinataire (sa room) et echo à l'envoyeur (sa room).
    io.to(`user:${receiverId}`).emit("chat:message", msg);
    socket.emit("chat:message", msg);

    // Crée une notif pour le destinataire (insert DB + push live via Socket.io).
    await sendNotification(receiverId, "chat_message", {
      from: { id: me },
      messageId: msg.id,
      preview: data.content.slice(0, 80),
    });
  });

  socket.on("chat:typing", (data: ChatTypingData) => {
    const me = socket.data.userId;
    if (!data?.receiverId) return;
    const receiverId = Number(data.receiverId);
    if (isNaN(receiverId)) return;
    io.to(`user:${receiverId}`).emit("chat:typing", { from: me });
  });

  socket.on("chat:reaction", (data: { messageId: number; emoji: string; receiverId: number }) => {
    const me = socket.data.userId;
    if (!data?.messageId || !data?.emoji || !data?.receiverId) return;
    const receiverId = Number(data.receiverId);
    if (isNaN(receiverId)) return;
    io.to(`user:${receiverId}`).emit("chat:reaction", {
      messageId: data.messageId,
      emoji: data.emoji,
      senderId: me,
    });
  });
}

function checkRate(socketId: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(socketId);
  if (!entry || now > entry.resetAt) {
    rateMap.set(socketId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}
