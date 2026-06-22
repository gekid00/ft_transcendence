import { relations } from "drizzle-orm";
import {
  users,
  friendships,
  blockedUsers,
  games,
  moves,
  lobbies,
  chatMessages,
  notifications,
} from "./schema.js";

// USERS — un user a "plein de" trucs
export const usersRelations = relations(users, ({ many }) => ({
  friendshipsAsUser: many(friendships, { relationName: "friendshipUser" }),
  friendshipsAsFriend: many(friendships, { relationName: "friendshipFriend" }),
  blocksAsBlocker: many(blockedUsers, { relationName: "blocker" }),
  blocksAsBlocked: many(blockedUsers, { relationName: "blocked" }),
  gamesAsPlayer1: many(games, { relationName: "player1" }),
  gamesAsPlayer2: many(games, { relationName: "player2" }),
  gamesAsWinner: many(games, { relationName: "winner" }),
  moves: many(moves),
  lobbies: many(lobbies),
  sentMessages: many(chatMessages, { relationName: "sender" }),
  receivedMessages: many(chatMessages, { relationName: "receiver" }),
  notifications: many(notifications),
}));

// FRIENDSHIPS — chaque ligne référence 2 users
export const friendshipsRelations = relations(friendships, ({ one }) => ({
  user: one(users, {
    fields: [friendships.userId],
    references: [users.id],
    relationName: "friendshipUser",
  }),
  friend: one(users, {
    fields: [friendships.friendId],
    references: [users.id],
    relationName: "friendshipFriend",
  }),
}));

// BLOCKED USERS
export const blockedUsersRelations = relations(blockedUsers, ({ one }) => ({
  blocker: one(users, {
    fields: [blockedUsers.userId],
    references: [users.id],
    relationName: "blocker",
  }),
  blocked: one(users, {
    fields: [blockedUsers.blockedUserId],
    references: [users.id],
    relationName: "blocked",
  }),
}));

// GAMES — référence 3 users (player1, player2, winner) + a plein de moves
export const gamesRelations = relations(games, ({ one, many }) => ({
  player1: one(users, {
    fields: [games.player1Id],
    references: [users.id],
    relationName: "player1",
  }),
  player2: one(users, {
    fields: [games.player2Id],
    references: [users.id],
    relationName: "player2",
  }),
  winner: one(users, {
    fields: [games.winnerId],
    references: [users.id],
    relationName: "winner",
  }),
  moves: many(moves),
}));

// MOVES — appartient à une game et a un joueur (ou null si IA)
export const movesRelations = relations(moves, ({ one }) => ({
  game: one(games, { fields: [moves.gameId], references: [games.id] }),
  player: one(users, { fields: [moves.playerId], references: [users.id] }),
}));

// LOBBIES — un créateur
export const lobbiesRelations = relations(lobbies, ({ one }) => ({
  creator: one(users, { fields: [lobbies.creatorId], references: [users.id] }),
}));

// CHAT MESSAGES — un sender et un receiver
export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  sender: one(users, {
    fields: [chatMessages.senderId],
    references: [users.id],
    relationName: "sender",
  }),
  receiver: one(users, {
    fields: [chatMessages.receiverId],
    references: [users.id],
    relationName: "receiver",
  }),
}));

// NOTIFICATIONS — appartient à un user
export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));
