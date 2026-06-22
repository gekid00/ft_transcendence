import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildTestApp, truncateAll, createTestUser, loginAs, createFriendship } from "../helpers.js";

describe("Lobbies routes", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeEach(async () => {
    await truncateAll();
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  // ─── GET /api/lobbies ────────────────────────────────────────────

  describe("GET /api/lobbies", () => {
    it("returns empty list when no lobbies", async () => {
      const user = await createTestUser({ email: "l@test.com", username: "lobbier" });
      const { cookie } = loginAs(user.id);
      const res = await app.inject({ method: "GET", url: "/api/lobbies", headers: { cookie } });
      expect(res.statusCode).toBe(200);
      const body = res.json() as any;
      expect(body).toEqual([]);
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({ method: "GET", url: "/api/lobbies" });
      expect(res.statusCode).toBe(401);
    });
  });

  // ─── POST /api/lobbies ───────────────────────────────────────────

  describe("POST /api/lobbies", () => {
    it("creates a public lobby with defaults", async () => {
      const user = await createTestUser({ email: "l@test.com", username: "creator" });
      const { cookie } = loginAs(user.id);
      const res = await app.inject({
        method: "POST",
        url: "/api/lobbies",
        headers: { cookie },
        payload: {},
      });
      expect(res.statusCode).toBe(201);
      const body = res.json() as any;
      expect(body.code).toBeDefined();
      expect(body.code.length).toBe(6);
      expect(body.isPublic).toBe(true);
      expect(body.mode).toBe("connect4");
      expect(body.timePerPlayerSeconds).toBe(180);
      expect(body.status).toBe("waiting");
      expect(body.creatorId).toBe(user.id);
    });

    it("creates a private lobby", async () => {
      const user = await createTestUser({ email: "l@test.com", username: "priv" });
      const { cookie } = loginAs(user.id);
      const res = await app.inject({
        method: "POST",
        url: "/api/lobbies",
        headers: { cookie },
        payload: { isPublic: false },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json() as any;
      expect(body.isPublic).toBe(false);
    });

    it("creates a Connect 5 lobby", async () => {
      const user = await createTestUser({ email: "l@test.com", username: "c5" });
      const { cookie } = loginAs(user.id);
      const res = await app.inject({
        method: "POST",
        url: "/api/lobbies",
        headers: { cookie },
        payload: { mode: "connect5" },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json() as any;
      expect(body.mode).toBe("connect5");
    });

    it("rejects invalid timePerPlayerSeconds", async () => {
      const user = await createTestUser({ email: "l@test.com", username: "badtime" });
      const { cookie } = loginAs(user.id);
      const res = await app.inject({
        method: "POST",
        url: "/api/lobbies",
        headers: { cookie },
        payload: { timePerPlayerSeconds: 999 },
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/lobbies",
        payload: {},
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ─── GET /api/lobbies/:id ────────────────────────────────────────

  describe("GET /api/lobbies/:id", () => {
    it("returns lobby detail", async () => {
      const user = await createTestUser({ email: "l@test.com", username: "detail" });
      const { cookie } = loginAs(user.id);
      const createRes = await app.inject({
        method: "POST",
        url: "/api/lobbies",
        headers: { cookie },
        payload: {},
      });
      const lobby = createRes.json() as any;
      const res = await app.inject({
        method: "GET",
        url: `/api/lobbies/${lobby.id}`,
        headers: { cookie },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as any;
      expect(body.id).toBe(lobby.id);
    });

    it("returns 404 for non-existent lobby", async () => {
      const user = await createTestUser({ email: "l@test.com", username: "nope" });
      const { cookie } = loginAs(user.id);
      const res = await app.inject({
        method: "GET",
        url: "/api/lobbies/99999",
        headers: { cookie },
      });
      expect(res.statusCode).toBe(404);
    });

    it("returns 400 for invalid id", async () => {
      const user = await createTestUser({ email: "l@test.com", username: "bad" });
      const { cookie } = loginAs(user.id);
      const res = await app.inject({
        method: "GET",
        url: "/api/lobbies/abc",
        headers: { cookie },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ─── POST /api/lobbies/:id/join ──────────────────────────────────

  describe("POST /api/lobbies/:id/join", () => {
    it("joins a public lobby", async () => {
      const creator = await createTestUser({ email: "c@test.com", username: "creator" });
      const joiner = await createTestUser({ email: "j@test.com", username: "joiner" });
      const { cookie: creatorCookie } = loginAs(creator.id);
      const { cookie: joinerCookie } = loginAs(joiner.id);

      const createRes = await app.inject({
        method: "POST",
        url: "/api/lobbies",
        headers: { cookie: creatorCookie },
        payload: { isPublic: true },
      });
      const lobby = createRes.json() as any;

      const joinRes = await app.inject({
        method: "POST",
        url: `/api/lobbies/${lobby.id}/join`,
        headers: { cookie: joinerCookie },
        payload: {},
      });
      expect(joinRes.statusCode).toBe(200);
      const body = joinRes.json() as any;
      expect(body.player2Id).toBe(joiner.id);
    });

    it("joins a private lobby with correct code", async () => {
      const creator = await createTestUser({ email: "c@test.com", username: "creator" });
      const joiner = await createTestUser({ email: "j@test.com", username: "joiner" });
      await createFriendship(creator.id, joiner.id, "accepted");
      const { cookie: creatorCookie } = loginAs(creator.id);
      const { cookie: joinerCookie } = loginAs(joiner.id);

      const createRes = await app.inject({
        method: "POST",
        url: "/api/lobbies",
        headers: { cookie: creatorCookie },
        payload: { isPublic: false },
      });
      const lobby = createRes.json() as any;

      const joinRes = await app.inject({
        method: "POST",
        url: `/api/lobbies/${lobby.id}/join`,
        headers: { cookie: joinerCookie },
        payload: { code: lobby.code },
      });
      expect(joinRes.statusCode).toBe(200);
    });

    it("rejects wrong code for private lobby", async () => {
      const creator = await createTestUser({ email: "c@test.com", username: "creator" });
      const joiner = await createTestUser({ email: "j@test.com", username: "joiner" });
      await createFriendship(creator.id, joiner.id, "accepted");
      const { cookie: creatorCookie } = loginAs(creator.id);
      const { cookie: joinerCookie } = loginAs(joiner.id);

      const createRes = await app.inject({
        method: "POST",
        url: "/api/lobbies",
        headers: { cookie: creatorCookie },
        payload: { isPublic: false },
      });
      const lobby = createRes.json() as any;

      const joinRes = await app.inject({
        method: "POST",
        url: `/api/lobbies/${lobby.id}/join`,
        headers: { cookie: joinerCookie },
        payload: { code: "WRONG" },
      });
      expect(joinRes.statusCode).toBe(403);
    });

    it("returns 400 if creator tries to join own lobby", async () => {
      const user = await createTestUser({ email: "l@test.com", username: "self" });
      const { cookie } = loginAs(user.id);

      const createRes = await app.inject({
        method: "POST",
        url: "/api/lobbies",
        headers: { cookie },
        payload: {},
      });
      const lobby = createRes.json() as any;

      const joinRes = await app.inject({
        method: "POST",
        url: `/api/lobbies/${lobby.id}/join`,
        headers: { cookie },
        payload: {},
      });
      expect(joinRes.statusCode).toBe(400);
    });

    it("returns 400 if lobby is already full", async () => {
      const creator = await createTestUser({ email: "c@test.com", username: "creator" });
      const joiner1 = await createTestUser({ email: "j1@test.com", username: "joiner1" });
      const joiner2 = await createTestUser({ email: "j2@test.com", username: "joiner2" });
      const { cookie: creatorCookie } = loginAs(creator.id);
      const { cookie: j1Cookie } = loginAs(joiner1.id);
      const { cookie: j2Cookie } = loginAs(joiner2.id);

      const createRes = await app.inject({
        method: "POST",
        url: "/api/lobbies",
        headers: { cookie: creatorCookie },
        payload: { isPublic: true },
      });
      const lobby = createRes.json() as any;

      await app.inject({
        method: "POST",
        url: `/api/lobbies/${lobby.id}/join`,
        headers: { cookie: j1Cookie },
        payload: {},
      });

      const joinRes = await app.inject({
        method: "POST",
        url: `/api/lobbies/${lobby.id}/join`,
        headers: { cookie: j2Cookie },
        payload: {},
      });
      expect(joinRes.statusCode).toBe(400);
    });

    it("returns 404 for non-existent lobby", async () => {
      const user = await createTestUser({ email: "l@test.com", username: "nope" });
      const { cookie } = loginAs(user.id);
      const res = await app.inject({
        method: "POST",
        url: "/api/lobbies/99999/join",
        headers: { cookie },
        payload: {},
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ─── POST /api/lobbies/:id/leave ─────────────────────────────────

  describe("POST /api/lobbies/:id/leave", () => {
    it("creator leaves → closes lobby", async () => {
      const user = await createTestUser({ email: "l@test.com", username: "leaver" });
      const { cookie } = loginAs(user.id);

      const createRes = await app.inject({
        method: "POST",
        url: "/api/lobbies",
        headers: { cookie },
        payload: {},
      });
      const lobby = createRes.json() as any;

      const leaveRes = await app.inject({
        method: "POST",
        url: `/api/lobbies/${lobby.id}/leave`,
        headers: { cookie },
      });
      expect(leaveRes.statusCode).toBe(200);
    });

    it("player2 leaves → removes from lobby", async () => {
      const creator = await createTestUser({ email: "c@test.com", username: "creator" });
      const joiner = await createTestUser({ email: "j@test.com", username: "joiner" });
      const { cookie: creatorCookie } = loginAs(creator.id);
      const { cookie: joinerCookie } = loginAs(joiner.id);

      const createRes = await app.inject({
        method: "POST",
        url: "/api/lobbies",
        headers: { cookie: creatorCookie },
        payload: { isPublic: true },
      });
      const lobby = createRes.json() as any;

      await app.inject({
        method: "POST",
        url: `/api/lobbies/${lobby.id}/join`,
        headers: { cookie: joinerCookie },
        payload: {},
      });

      const leaveRes = await app.inject({
        method: "POST",
        url: `/api/lobbies/${lobby.id}/leave`,
        headers: { cookie: joinerCookie },
      });
      expect(leaveRes.statusCode).toBe(200);
    });

    it("returns 403 if user is not in lobby", async () => {
      const creator = await createTestUser({ email: "c@test.com", username: "creator" });
      const outsider = await createTestUser({ email: "o@test.com", username: "outsider" });
      const { cookie: creatorCookie } = loginAs(creator.id);
      const { cookie: outsiderCookie } = loginAs(outsider.id);

      const createRes = await app.inject({
        method: "POST",
        url: "/api/lobbies",
        headers: { cookie: creatorCookie },
        payload: {},
      });
      const lobby = createRes.json() as any;

      const leaveRes = await app.inject({
        method: "POST",
        url: `/api/lobbies/${lobby.id}/leave`,
        headers: { cookie: outsiderCookie },
      });
      expect(leaveRes.statusCode).toBe(403);
    });

    it("returns 404 for non-existent lobby", async () => {
      const user = await createTestUser({ email: "l@test.com", username: "nope" });
      const { cookie } = loginAs(user.id);
      const res = await app.inject({
        method: "POST",
        url: "/api/lobbies/99999/leave",
        headers: { cookie },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ─── POST /api/lobbies/:id/decline ───────────────────────────────

  describe("POST /api/lobbies/:id/decline", () => {
    it("declines (closes) a lobby", async () => {
      const user = await createTestUser({ email: "l@test.com", username: "decliner" });
      const { cookie } = loginAs(user.id);

      const createRes = await app.inject({
        method: "POST",
        url: "/api/lobbies",
        headers: { cookie },
        payload: {},
      });
      const lobby = createRes.json() as any;

      const declineRes = await app.inject({
        method: "POST",
        url: `/api/lobbies/${lobby.id}/decline`,
        headers: { cookie },
      });
      expect(declineRes.statusCode).toBe(200);
      const body = declineRes.json() as any;
      expect(body.status).toBe("closed");
    });

    it("returns 404 for non-existent lobby", async () => {
      const user = await createTestUser({ email: "l@test.com", username: "nope" });
      const { cookie } = loginAs(user.id);
      const res = await app.inject({
        method: "POST",
        url: "/api/lobbies/99999/decline",
        headers: { cookie },
      });
      expect(res.statusCode).toBe(404);
    });
  });
});
