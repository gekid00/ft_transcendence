import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildTestApp, truncateAll, createTestUser } from "./helpers.js";

interface LeaderboardResponse {
  entries: Array<{
    rank: number;
    username: string;
    rating: number;
    peakRating: number;
    winRate: number;
    title: string;
  }>;
}



describe("GET /api/leaderboard", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeEach(async () => {
    await truncateAll();
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns an empty list when no users exist", async () => {
    const res = await app.inject({ method: "GET", url: "/api/leaderboard" });
    expect(res.statusCode).toBe(200);
    expect((res.json() as LeaderboardResponse).entries).toEqual([]);
  });

  it("sorts by rating DESC then peak_rating DESC then id ASC", async () => {
    await createTestUser({ email: "a@a", username: "Alpha", rating: 1500, peakRating: 1500 });
    await createTestUser({ email: "b@b", username: "Beta", rating: 1500, peakRating: 1600 });
    await createTestUser({ email: "c@c", username: "Gamma", rating: 1700, peakRating: 1700 });
    await createTestUser({ email: "d@d", username: "Delta", rating: 1200, peakRating: 1300 });

    const res = await app.inject({ method: "GET", url: "/api/leaderboard?limit=10" });
    expect(res.statusCode).toBe(200);
    const { entries } = res.json() as LeaderboardResponse;
    expect(entries.map((e) => e.username)).toEqual([
      "Gamma",
      "Beta",
      "Alpha",
      "Delta",
    ]);
    expect(entries.map((e) => e.rank)).toEqual([1, 2, 3, 4]);
  });

  it("excludes deleted users", async () => {
    await createTestUser({ email: "a@a", username: "Alive", rating: 2000, peakRating: 2000 });
    await createTestUser({
      email: "b@b",
      username: "Ghost",
      rating: 3000,
      peakRating: 3000,
      isDeleted: true,
    });

    const res = await app.inject({ method: "GET", url: "/api/leaderboard" });
    const { entries } = res.json() as LeaderboardResponse;
    expect(entries).toHaveLength(1);
    expect(entries[0].username).toBe("Alive");
  });

  it("honors the ?limit query parameter", async () => {
    for (let i = 0; i < 8; i++) {
      await createTestUser({
        email: `u${i}@u`,
        username: `user${i}`,
        rating: 2000 - i,
        peakRating: 2000 - i,
      });
    }

    const res = await app.inject({ method: "GET", url: "/api/leaderboard?limit=3" });
    const { entries } = res.json() as LeaderboardResponse;
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.username)).toEqual(["user0", "user1", "user2"]);
  });

  it("uses the default limit of 6", async () => {
    for (let i = 0; i < 10; i++) {
      await createTestUser({
        email: `u${i}@u`,
        username: `user${i}`,
        rating: 2000 - i,
        peakRating: 2000 - i,
      });
    }
    const res = await app.inject({ method: "GET", url: "/api/leaderboard" });
    const { entries } = res.json() as LeaderboardResponse;
    expect(entries).toHaveLength(6);
  });

  it("rejects limit < 1", async () => {
    const res = await app.inject({ method: "GET", url: "/api/leaderboard?limit=0" });
    expect(res.statusCode).toBe(400);
  });

  it("rejects limit > 50", async () => {
    const res = await app.inject({ method: "GET", url: "/api/leaderboard?limit=51" });
    expect(res.statusCode).toBe(400);
  });

  it("rejects non-integer limit", async () => {
    const res = await app.inject({ method: "GET", url: "/api/leaderboard?limit=abc" });
    expect(res.statusCode).toBe(400);
  });

  it("derives the title from the rating", async () => {
    await createTestUser({ email: "a@a", username: "Newbie", rating: 950, peakRating: 950 });
    await createTestUser({ email: "b@b", username: "Rookie", rating: 1100, peakRating: 1100 });
    await createTestUser({ email: "c@c", username: "Pro", rating: 1500, peakRating: 1500 });
    await createTestUser({ email: "d@d", username: "Veteran", rating: 1900, peakRating: 1900 });
    await createTestUser({ email: "e@e", username: "Guru", rating: 2300, peakRating: 2300 });

    const res = await app.inject({ method: "GET", url: "/api/leaderboard" });
    const { entries } = res.json() as LeaderboardResponse;
    const byName = Object.fromEntries(entries.map((e) => [e.username, e.title]));
    expect(byName.Newbie).toBe("Beginner");
    expect(byName.Rookie).toBe("Apprentice");
    expect(byName.Pro).toBe("Expert");
    expect(byName.Veteran).toBe("Master");
    expect(byName.Guru).toBe("Grandmaster");
  });

  it("computes winRate as a 1-decimal percentage", async () => {
    await createTestUser({
      email: "a@a",
      username: "HalfWin",
      rating: 1500,
      peakRating: 1500,
      gamesPlayed: 10,
      gamesWon: 5,
      gamesLost: 4,
      gamesDrawn: 1,
    });
    await createTestUser({
      email: "b@b",
      username: "AllWin",
      rating: 1500,
      peakRating: 1500,
      gamesPlayed: 7,
      gamesWon: 7,
    });
    await createTestUser({
      email: "c@c",
      username: "NoGames",
      rating: 1500,
      peakRating: 1500,
    });

    const res = await app.inject({ method: "GET", url: "/api/leaderboard" });
    const { entries } = res.json() as LeaderboardResponse;
    const byName = Object.fromEntries(entries.map((e) => [e.username, e.winRate]));
    expect(byName.HalfWin).toBe(50);
    expect(byName.AllWin).toBe(100);
    expect(byName.NoGames).toBe(0);
  });

  it("does not require auth (public endpoint)", async () => {
    // No cookie sent — leaderboard is anonymous.
    const res = await app.inject({ method: "GET", url: "/api/leaderboard" });
    expect(res.statusCode).toBe(200);
  });
});
