import { and, eq, gt, lt, or, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";

/**
 * 1-based global rank of a user in the same ordering used by /api/leaderboard:
 * `rating DESC, peak_rating DESC, id ASC`. Counts non-deleted users that
 * strictly outrank the given (rating, peakRating, id) tuple, plus 1.
 */
export async function getUserRank(
  rating: number,
  peakRating: number,
  userId: number,
): Promise<number> {
  const [row] = await db
    .select({ rank: sql<number>`count(*)::int + 1` })
    .from(users)
    .where(
      and(
        eq(users.isDeleted, false),
        or(
          gt(users.rating, rating),
          and(eq(users.rating, rating), gt(users.peakRating, peakRating)),
          and(
            eq(users.rating, rating),
            eq(users.peakRating, peakRating),
            lt(users.id, userId),
          ),
        ),
      ),
    );
  return row?.rank ?? 1;
}
