// GET /api/leaderboard?limit=N — public top-N users ordered by Elo.
//
//   limit: optional, default 6, min 1, max 50. Out-of-range → 400.
//   No auth required: the landing page is anonymous; the playStore already
//   runs without a logged-in user. We expose username + rating only — no
//   email, no bio, no avatar (avoids leaking PII for the public list).
//
// Response shape mirrors the wireframe in apps/web/src/components/landing/
// Leaderboard.tsx (so the existing UI can adopt the new store with a
// single `entries: []` swap once we land the web-side commit).
//
// Ranking is a single SQL pass with ROW_NUMBER() over the same ordering
// used by getUserRank() in apps/server/src/lib/rank.ts, so a user's
// /me rank always matches their leaderboard position. The title CASE in
// SQL must mirror the TS titleForRating() thresholds in
// apps/server/src/game/elo.ts — kept in sync by the test suite.

import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";

const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 50;

export interface LeaderboardEntry {
  rank: number;
  username: string;
  rating: number;
  peakRating: number;
  winRate: number;
  title: "Beginner" | "Apprentice" | "Expert" | "Master" | "Grandmaster";
  gamesPlayed: number;
}

export async function leaderboardRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { limit?: string } }>(
    "/leaderboard",
    async (request, reply) => {
      const raw = request.query.limit;
      let limit = DEFAULT_LIMIT;
      if (raw !== undefined) {
        const parsed = Number(raw);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
          return reply.code(400).send({
            error: `Invalid limit (must be integer 1-${MAX_LIMIT})`,
          });
        }
        limit = parsed;
      }

      const rows = await db
        .select({
          rank: sql<number>`ROW_NUMBER() OVER (ORDER BY ${users.rating} DESC, ${users.peakRating} DESC, ${users.id} ASC)`,
          username: users.username,
          rating: users.rating,
          peakRating: users.peakRating,
          gamesPlayed: users.gamesPlayed,
          winRate: sql<number>`CASE WHEN ${users.gamesPlayed} > 0 THEN ROUND((${users.gamesWon}::numeric / ${users.gamesPlayed}) * 100, 1) ELSE 0 END`,
          title: sql<LeaderboardEntry["title"]>`CASE
            WHEN ${users.rating} >= 2200 THEN 'Grandmaster'
            WHEN ${users.rating} >= 1800 THEN 'Master'
            WHEN ${users.rating} >= 1400 THEN 'Expert'
            WHEN ${users.rating} >= 1000 THEN 'Apprentice'
            ELSE 'Beginner'
          END`,
        })
        .from(users)
        .where(sql`${users.isDeleted} = false`)
        .orderBy(
          sql`${users.rating} DESC`,
          sql`${users.peakRating} DESC`,
          sql`${users.id} ASC`,
        )
        .limit(limit);

      const entries: LeaderboardEntry[] = rows.map((r) => ({
        rank: Number(r.rank),
        username: r.username,
        rating: Number(r.rating),
        peakRating: Number(r.peakRating),
        winRate: Number(r.winRate),
        title: r.title,
        gamesPlayed: Number(r.gamesPlayed),
      }));

      return reply.send({ entries });
    },
  );
}
