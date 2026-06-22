import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildTestApp, truncateAll, createTestUser, loginAs, createGame } from "../helpers.js";

describe("Games routes", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeEach(async () => {
    await truncateAll();
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  // ─── POST /api/games/ai ──────────────────────────────────────────

  describe("POST /api/games/ai", () => {
    it("creates an AI game with defaults", async () => {
      const user = await createTestUser({ email: "ai@test.com", username: "aipayer" });
      const { cookie } = loginAs(user.id);
      const res = await app.inject({
        method: "POST",
        url: "/api/games/ai",
        headers: { cookie },
        payload: {},
      });
      expect(res.statusCode).toBe(201);
      const body = res.json() as any;
      expect(body.gameId).toBeDefined();
    });

    it("creates an AI game with specific difficulty", async () => {
      const user = await createTestUser({ email: "ai@test.com", username: "aipayer" });
      const { cookie } = loginAs(user.id);
      const res = await app.inject({
        method: "POST",
        url: "/api/games/ai",
        headers: { cookie },
        payload: { difficulty: "hard", timePerPlayerSeconds: 600 },
      });
      expect(res.statusCode).toBe(201);
    });

    it("rejects invalid timePerPlayerSeconds", async () => {
      const user = await createTestUser({ email: "ai@test.com", username: "aipayer" });
      const { cookie } = loginAs(user.id);
      const res = await app.inject({
        method: "POST",
        url: "/api/games/ai",
        headers: { cookie },
        payload: { timePerPlayerSeconds: 999 },
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/games/ai",
        payload: {},
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ─── GET /api/games/active ───────────────────────────────────────

  describe("GET /api/games/active", () => {
    it("returns empty list when no active games", async () => {
      const user = await createTestUser({ email: "g@test.com", username: "player" });
      const { cookie } = loginAs(user.id);
      const res = await app.inject({
        method: "GET",
        url: "/api/games/active",
        headers: { cookie },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as any;
      expect(body).toEqual([]);
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({ method: "GET", url: "/api/games/active" });
      expect(res.statusCode).toBe(401);
    });
  });

  // ─── GET /api/games/:id ──────────────────────────────────────────

  describe("GET /api/games/:id", () => {
    it("returns game detail for participant", async () => {
      const user1 = await createTestUser({ email: "p1@test.com", username: "player1" });
      const user2 = await createTestUser({ email: "p2@test.com", username: "player2" });
      const game = await createGame({ player1Id: user1.id, player2Id: user2.id, status: "in_progress" });
      const { cookie } = loginAs(user1.id);
      const res = await app.inject({
        method: "GET",
        url: `/api/games/${game.id}`,
        headers: { cookie },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as any;
      expect(body.game.id).toBe(game.id);
    });

    it("returns 403 for non-participant", async () => {
      const user1 = await createTestUser({ email: "p1@test.com", username: "player1" });
      const user2 = await createTestUser({ email: "p2@test.com", username: "player2" });
      const outsider = await createTestUser({ email: "o@test.com", username: "outsider" });
      const game = await createGame({ player1Id: user1.id, player2Id: user2.id });
      const { cookie } = loginAs(outsider.id);
      const res = await app.inject({
        method: "GET",
        url: `/api/games/${game.id}`,
        headers: { cookie },
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 404 for non-existent game", async () => {
      const user = await createTestUser({ email: "g@test.com", username: "player" });
      const { cookie } = loginAs(user.id);
      const res = await app.inject({
        method: "GET",
        url: "/api/games/99999",
        headers: { cookie },
      });
      expect(res.statusCode).toBe(404);
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({ method: "GET", url: "/api/games/1" });
      expect(res.statusCode).toBe(401);
    });
  });

  // ─── POST /api/games/test-multiplayer ────────────────────────────

  describe("POST /api/games/test-multiplayer", () => {
    it("creates a test multiplayer game", async () => {
      const user = await createTestUser({ email: "tm@test.com", username: "tester" });
      const { cookie } = loginAs(user.id);
      const res = await app.inject({
        method: "POST",
        url: "/api/games/test-multiplayer",
        headers: { cookie },
        payload: {},
      });
      expect(res.statusCode).toBe(201);
      const body = res.json() as any;
      expect(body.gameId).toBeDefined();
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/games/test-multiplayer",
        payload: {},
      });
      expect(res.statusCode).toBe(401);
    });
  });
});
