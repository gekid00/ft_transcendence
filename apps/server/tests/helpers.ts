import { buildServer } from "../src/server.js";
import { db } from "../src/db/client.js";
import { signToken } from "../src/auth/jwt.js";
import { hashPassword } from "../src/auth/password.js";
import {
  users,
  friendships,
  blockedUsers,
  chatMessages,
  notifications,
  games,
  lobbies,
  moves,
} from "../src/db/schema.js";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

/**
 * Build a ready-to-test Fastify instance.
 * Caller MUST call app.close() in afterEach.
 */
export async function buildTestApp(): Promise<FastifyInstance> {
  const app = await buildServer();
  await app.ready();
  return app;
}

/**
 * Truncate all tables between tests.
 */
export async function truncateAll(): Promise<void> {
  await db.execute(sql`TRUNCATE TABLE
    moves, games, notifications, chat_messages,
    friendships, blocked_users, lobbies, users
    RESTART IDENTITY CASCADE`);
}

/**
 * Insert a user directly into the DB and return the record.
 */
export async function createTestUser(opts: {
  email?: string;
  username?: string;
  password?: string;
  rating?: number;
  peakRating?: number;
  gamesPlayed?: number;
  gamesWon?: number;
  gamesLost?: number;
  gamesDrawn?: number;
  isDeleted?: boolean;
  signupCompletedAt?: Date | null;
}) {
  const password = opts.password
    ? await hashPassword(opts.password)
    : null;

  const [user] = await db
    .insert(users)
    .values({
      email: opts.email ?? `test_${Date.now()}@test.com`,
      username: opts.username ?? `testuser_${Date.now()}`,
      password,
      rating: opts.rating ?? 1000,
      peakRating: opts.peakRating ?? 1000,
      gamesPlayed: opts.gamesPlayed ?? 0,
      gamesWon: opts.gamesWon ?? 0,
      gamesLost: opts.gamesLost ?? 0,
      gamesDrawn: opts.gamesDrawn ?? 0,
      isDeleted: opts.isDeleted ?? false,
      signupCompletedAt: opts.signupCompletedAt ?? null,
    })
    .returning();

  return user;
}

/**
 * Generate an auth cookie header for a given userId.
 */
export function loginAs(userId: number): { cookie: string } {
  const token = signToken({ userId });
  return { cookie: `auth_token=${token}` };
}

/**
 * Extract the auth_token from a response's set-cookie header.
 */
export function extractAuthCookie(res: any): string | null {
  const setCookie = res.headers["set-cookie"];
  if (!setCookie) return null;
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const c of cookies) {
    if (c.startsWith("auth_token=")) {
      return c.split(";")[0]; // "auth_token=xxx"
    }
  }
  return null;
}

/**
 * Insert a friendship between two users.
 */
export async function createFriendship(
  userId: number,
  friendId: number,
  status: "pending" | "accepted" = "accepted"
) {
  const [row] = await db
    .insert(friendships)
    .values({ userId, friendId, status })
    .returning();
  return row;
}

/**
 * Insert a notification for a user.
 */
export async function createNotification(
  userId: number,
  type: string,
  content: Record<string, any> = {}
) {
  const [row] = await db
    .insert(notifications)
    .values({ userId, type, content })
    .returning();
  return row;
}

/**
 * Insert a chat message between two users.
 */
export async function createChatMessage(
  senderId: number,
  receiverId: number,
  content: string
) {
  const [row] = await db
    .insert(chatMessages)
    .values({ senderId, receiverId, content })
    .returning();
  return row;
}

/**
 * Insert a game record.
 */
export async function createGame(opts: {
  player1Id: number;
  player2Id?: number | null;
  isAiOpponent?: boolean;
  aiDifficulty?: string;
  status?: string;
  winnerId?: number | null;
  mode?: string;
  timePerPlayerSeconds?: number;
  startedAt?: Date;
  finishedAt?: Date;
}) {
  const [game] = await db
    .insert(games)
    .values({
      player1Id: opts.player1Id,
      player2Id: opts.player2Id ?? null,
      isAiOpponent: opts.isAiOpponent ?? false,
      aiDifficulty: opts.aiDifficulty as any ?? null,
      status: (opts.status ?? "in_progress") as any,
      winnerId: opts.winnerId ?? null,
      mode: (opts.mode ?? "connect4") as any,
      timePerPlayerSeconds: opts.timePerPlayerSeconds ?? 180,
      startedAt: opts.startedAt ?? new Date(),
      finishedAt: opts.finishedAt ?? null,
    })
    .returning();
  return game;
}
