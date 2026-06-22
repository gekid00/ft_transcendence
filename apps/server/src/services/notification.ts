// Service de notifications.
// Centralisé : appelé depuis n'importe où (friends, chat, game...).
// Insert en DB + push live via Socket.io (vers la room user:<id> du destinataire).

import type { Server } from "socket.io";
import { db } from "../db/client.js";
import { notifications, users } from "../db/schema.js";
import { eq } from "drizzle-orm";

export type NotificationType =
  | "friend_request"
  | "friend_accepted"
  | "game_invite"
  | "game_finished"
  | "chat_message";

// Référence vers le serveur Socket.io, injectée au démarrage par setupSocket().
let ioRef: Server | null = null;

export function setNotificationIO(io: Server) {
  ioRef = io;
}

// Crée une notif pour un user (DB + push live si online).
export async function sendNotification(
  userId: number,
  type: NotificationType,
  content: Record<string, unknown>
): Promise<void> {
  const [created] = await db
    .insert(notifications)
    .values({
      userId,
      type,
      content,
      read: false,
    })
    .returning();

  let enriched = { ...created };
  const payload = created.content as any;
  if (payload?.from?.id) {
    const [u] = await db
      .select({
        id: users.id,
        username: users.username,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(eq(users.id, Number(payload.from.id)));
    if (u) {
      enriched.content = {
        ...payload,
        from: {
          ...payload.from,
          username: u.username,
          avatarUrl: u.avatarUrl,
        },
      };
    }
  }

  // Push live si Socket.io est initialisé.
  if (ioRef) {
    ioRef.to(`user:${userId}`).emit("notification:new", enriched);
  }
}
