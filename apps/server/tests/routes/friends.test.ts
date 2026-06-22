import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildTestApp, truncateAll, createTestUser, loginAs, createFriendship } from "../helpers.js";

describe("Friends routes", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeEach(async () => {
    await truncateAll();
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  // ─── GET /api/friends ─────────────────────────────────────────────

  describe("GET /api/friends", () => {
    it("returns empty list for new user", async () => {
      const user = await createTestUser({ email: "a@test.com", username: "a" });
      const { cookie } = loginAs(user.id);
      const res = await app.inject({ method: "GET", url: "/api/friends", headers: { cookie } });
      expect(res.statusCode).toBe(200);
      const body = res.json() as any;
      expect(body).toEqual([]);
    });

    it("returns accepted friends", async () => {
      const user1 = await createTestUser({ email: "a@test.com", username: "alice_f" });
      const user2 = await createTestUser({ email: "b@test.com", username: "bob_f" });
      await createFriendship(user1.id, user2.id, "accepted");
      const { cookie } = loginAs(user1.id);
      const res = await app.inject({ method: "GET", url: "/api/friends", headers: { cookie } });
      const body = res.json() as any;
      expect(body.length).toBe(1);
      expect(body[0].username).toBe("bob_f");
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({ method: "GET", url: "/api/friends" });
      expect(res.statusCode).toBe(401);
    });
  });

  // ─── GET /api/friends/requests ────────────────────────────────────

  describe("GET /api/friends/requests", () => {
    it("returns pending requests", async () => {
      const user1 = await createTestUser({ email: "a@test.com", username: "alice_r" });
      const user2 = await createTestUser({ email: "b@test.com", username: "bob_r" });
      await createFriendship(user2.id, user1.id, "pending");
      const { cookie } = loginAs(user1.id);
      const res = await app.inject({ method: "GET", url: "/api/friends/requests", headers: { cookie } });
      const body = res.json() as any;
      expect(body.length).toBe(1);
      expect(body[0].username).toBe("bob_r");
    });
  });

  // ─── POST /api/friends/request ────────────────────────────────────

  describe("POST /api/friends/request", () => {
    it("sends a friend request", async () => {
      const user1 = await createTestUser({ email: "a@test.com", username: "alice_req" });
      const user2 = await createTestUser({ email: "b@test.com", username: "bob_req" });
      const { cookie } = loginAs(user1.id);
      const res = await app.inject({
        method: "POST",
        url: "/api/friends/request",
        headers: { cookie },
        payload: { userId: user2.id },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json() as any;
      expect(body.status).toBe("pending");
    });

    it("returns 400 if self-request", async () => {
      const user = await createTestUser({ email: "a@test.com", username: "self" });
      const { cookie } = loginAs(user.id);
      const res = await app.inject({
        method: "POST",
        url: "/api/friends/request",
        headers: { cookie },
        payload: { userId: user.id },
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 409 if friendship already exists", async () => {
      const user1 = await createTestUser({ email: "a@test.com", username: "alice_dup" });
      const user2 = await createTestUser({ email: "b@test.com", username: "bob_dup" });
      await createFriendship(user1.id, user2.id, "accepted");
      const { cookie } = loginAs(user1.id);
      const res = await app.inject({
        method: "POST",
        url: "/api/friends/request",
        headers: { cookie },
        payload: { userId: user2.id },
      });
      expect(res.statusCode).toBe(409);
    });

    it("returns 400 if missing userId", async () => {
      const user = await createTestUser({ email: "a@test.com", username: "a" });
      const { cookie } = loginAs(user.id);
      const res = await app.inject({
        method: "POST",
        url: "/api/friends/request",
        headers: { cookie },
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/friends/request",
        payload: { userId: 1 },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ─── POST /api/friends/respond ────────────────────────────────────

  describe("POST /api/friends/respond", () => {
    it("accepts a friend request", async () => {
      const user1 = await createTestUser({ email: "a@test.com", username: "alice_acc" });
      const user2 = await createTestUser({ email: "b@test.com", username: "bob_acc" });
      const friendship = await createFriendship(user2.id, user1.id, "pending");
      const { cookie } = loginAs(user1.id);
      const res = await app.inject({
        method: "POST",
        url: "/api/friends/respond",
        headers: { cookie },
        payload: { friendshipId: friendship.id, accept: true },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as any;
      expect(body.status).toBe("accepted");
    });

    it("declines a friend request", async () => {
      const user1 = await createTestUser({ email: "a@test.com", username: "alice_dec" });
      const user2 = await createTestUser({ email: "b@test.com", username: "bob_dec" });
      const friendship = await createFriendship(user2.id, user1.id, "pending");
      const { cookie } = loginAs(user1.id);
      const res = await app.inject({
        method: "POST",
        url: "/api/friends/respond",
        headers: { cookie },
        payload: { friendshipId: friendship.id, accept: false },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as any;
      expect(body.status).toBe("declined");
    });

    it("returns 404 if request not found", async () => {
      const user = await createTestUser({ email: "a@test.com", username: "a" });
      const { cookie } = loginAs(user.id);
      const res = await app.inject({
        method: "POST",
        url: "/api/friends/respond",
        headers: { cookie },
        payload: { friendshipId: 99999, accept: true },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ─── DELETE /api/friends/:id ──────────────────────────────────────

  describe("DELETE /api/friends/:id", () => {
    it("removes a friendship", async () => {
      const user1 = await createTestUser({ email: "a@test.com", username: "alice_rem" });
      const user2 = await createTestUser({ email: "b@test.com", username: "bob_rem" });
      const friendship = await createFriendship(user1.id, user2.id, "accepted");
      const { cookie } = loginAs(user1.id);
      const res = await app.inject({
        method: "DELETE",
        url: `/api/friends/${friendship.id}`,
        headers: { cookie },
      });
      expect(res.statusCode).toBe(200);
    });

    it("returns 404 if friendship not found", async () => {
      const user = await createTestUser({ email: "a@test.com", username: "a" });
      const { cookie } = loginAs(user.id);
      const res = await app.inject({
        method: "DELETE",
        url: "/api/friends/99999",
        headers: { cookie },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ─── POST /api/block ──────────────────────────────────────────────

  describe("POST /api/block", () => {
    it("blocks a user", async () => {
      const user1 = await createTestUser({ email: "a@test.com", username: "alice_blk" });
      const user2 = await createTestUser({ email: "b@test.com", username: "bob_blk" });
      const { cookie } = loginAs(user1.id);
      const res = await app.inject({
        method: "POST",
        url: "/api/block",
        headers: { cookie },
        payload: { userId: user2.id },
      });
      expect(res.statusCode).toBe(201);
    });

    it("returns 400 if self-block", async () => {
      const user = await createTestUser({ email: "a@test.com", username: "self" });
      const { cookie } = loginAs(user.id);
      const res = await app.inject({
        method: "POST",
        url: "/api/block",
        headers: { cookie },
        payload: { userId: user.id },
      });
      expect(res.statusCode).toBe(400);
    });

    it("removes friendship when blocking", async () => {
      const user1 = await createTestUser({ email: "a@test.com", username: "alice_bf" });
      const user2 = await createTestUser({ email: "b@test.com", username: "bob_bf" });
      await createFriendship(user1.id, user2.id, "accepted");
      const { cookie } = loginAs(user1.id);
      await app.inject({
        method: "POST",
        url: "/api/block",
        headers: { cookie },
        payload: { userId: user2.id },
      });
      // Check friends list is empty
      const friendsRes = await app.inject({ method: "GET", url: "/api/friends", headers: { cookie } });
      const body = friendsRes.json() as any;
      expect(body.length).toBe(0);
    });
  });

  // ─── DELETE /api/block/:id ────────────────────────────────────────

  describe("DELETE /api/block/:id", () => {
    it("unblocks a user", async () => {
      const user1 = await createTestUser({ email: "a@test.com", username: "alice_unb" });
      const user2 = await createTestUser({ email: "b@test.com", username: "bob_unb" });
      const { cookie } = loginAs(user1.id);
      await app.inject({
        method: "POST",
        url: "/api/block",
        headers: { cookie },
        payload: { userId: user2.id },
      });
      const res = await app.inject({
        method: "DELETE",
        url: `/api/block/${user2.id}`,
        headers: { cookie },
      });
      expect(res.statusCode).toBe(200);
    });
  });
});
