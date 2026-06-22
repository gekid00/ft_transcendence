import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildTestApp, truncateAll, createTestUser, loginAs } from "../helpers.js";

describe("Users routes", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeEach(async () => {
    await truncateAll();
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  // ─── GET /api/users/:id ──────────────────────────────────────────

  describe("GET /api/users/:id", () => {
    it("returns public profile", async () => {
      const user = await createTestUser({ email: "pub@test.com", username: "pubuser" });
      const res = await app.inject({ method: "GET", url: `/api/users/${user.id}` });
      expect(res.statusCode).toBe(200);
      const body = res.json() as any;
      expect(body.username).toBe("pubuser");
      expect(body.id).toBe(user.id);
    });

    it("returns 404 for non-existent user", async () => {
      const res = await app.inject({ method: "GET", url: "/api/users/99999" });
      expect(res.statusCode).toBe(404);
    });

    it("returns 400 for invalid id", async () => {
      const res = await app.inject({ method: "GET", url: "/api/users/abc" });
      expect(res.statusCode).toBe(400);
    });

    it("returns placeholder for deleted user", async () => {
      const user = await createTestUser({ email: "del@test.com", username: "deluser", isDeleted: true });
      const res = await app.inject({ method: "GET", url: `/api/users/${user.id}` });
      expect(res.statusCode).toBe(200);
      const body = res.json() as any;
      expect(body.username).toBe("Joueur supprimé");
    });
  });

  // ─── GET /api/users/check-username ────────────────────────────────

  describe("GET /api/users/check-username", () => {
    it("returns available: true for unused username", async () => {
      const res = await app.inject({ method: "GET", url: "/api/users/check-username?q=freeuser" });
      expect(res.statusCode).toBe(200);
      const body = res.json() as any;
      expect(body.available).toBe(true);
    });

    it("returns available: false for taken username", async () => {
      await createTestUser({ email: "a@test.com", username: "taken_name" });
      const res = await app.inject({ method: "GET", url: "/api/users/check-username?q=taken_name" });
      const body = res.json() as any;
      expect(body.available).toBe(false);
    });

    it("returns available: false for invalid username format", async () => {
      const res = await app.inject({ method: "GET", url: "/api/users/check-username?q=ab" });
      const body = res.json() as any;
      expect(body.available).toBe(false);
    });
  });

  // ─── PUT /api/profile ─────────────────────────────────────────────

  describe("PUT /api/profile", () => {
    it("updates username", async () => {
      const user = await createTestUser({ email: "u@test.com", username: "oldname" });
      const { cookie } = loginAs(user.id);
      const res = await app.inject({
        method: "PUT",
        url: "/api/profile",
        headers: { cookie },
        payload: { username: "newname" },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as any;
      expect(body.username).toBe("newname");
    });

    it("updates bio", async () => {
      const user = await createTestUser({ email: "b@test.com", username: "biouser" });
      const { cookie } = loginAs(user.id);
      const res = await app.inject({
        method: "PUT",
        url: "/api/profile",
        headers: { cookie },
        payload: { bio: "Hello world" },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as any;
      expect(body.bio).toBe("Hello world");
    });

    it("returns 409 if username is already taken", async () => {
      const user1 = await createTestUser({ email: "a@test.com", username: "name_a" });
      await createTestUser({ email: "b@test.com", username: "name_b" });
      const { cookie } = loginAs(user1.id);
      const res = await app.inject({
        method: "PUT",
        url: "/api/profile",
        headers: { cookie },
        payload: { username: "name_b" },
      });
      expect(res.statusCode).toBe(409);
    });

    it("returns 400 if bio exceeds max length", async () => {
      const user = await createTestUser({ email: "b@test.com", username: "biouser" });
      const { cookie } = loginAs(user.id);
      const res = await app.inject({
        method: "PUT",
        url: "/api/profile",
        headers: { cookie },
        payload: { bio: "x".repeat(200) },
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({
        method: "PUT",
        url: "/api/profile",
        payload: { username: "hacker" },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ─── GET /api/profile ─────────────────────────────────────────────

  describe("GET /api/profile", () => {
    it("returns own profile with email", async () => {
      const user = await createTestUser({ email: "own@test.com", username: "ownuser" });
      const { cookie } = loginAs(user.id);
      const res = await app.inject({
        method: "GET",
        url: "/api/profile",
        headers: { cookie },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as any;
      expect(body.email).toBe("own@test.com");
      expect(body.username).toBe("ownuser");
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({ method: "GET", url: "/api/profile" });
      expect(res.statusCode).toBe(401);
    });
  });

  // ─── PUT /api/profile/password ────────────────────────────────────

  describe("PUT /api/profile/password", () => {
    it("changes password with correct current password", async () => {
      const user = await createTestUser({ email: "pw@test.com", username: "pwuser", password: "oldpass123" });
      const { cookie } = loginAs(user.id);
      const res = await app.inject({
        method: "PUT",
        url: "/api/profile/password",
        headers: { cookie },
        payload: { currentPassword: "oldpass123", newPassword: "newpass123" },
      });
      expect(res.statusCode).toBe(200);
    });

    it("returns 401 with wrong current password", async () => {
      const user = await createTestUser({ email: "pw@test.com", username: "pwuser", password: "oldpass123" });
      const { cookie } = loginAs(user.id);
      const res = await app.inject({
        method: "PUT",
        url: "/api/profile/password",
        headers: { cookie },
        payload: { currentPassword: "wrongpass", newPassword: "newpass123" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("returns 400 if new password is too short", async () => {
      const user = await createTestUser({ email: "pw@test.com", username: "pwuser", password: "oldpass123" });
      const { cookie } = loginAs(user.id);
      const res = await app.inject({
        method: "PUT",
        url: "/api/profile/password",
        headers: { cookie },
        payload: { currentPassword: "oldpass123", newPassword: "short" },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ─── GET /api/users/:id/stats ─────────────────────────────────────

  describe("GET /api/users/:id/stats", () => {
    it("returns stats for a user", async () => {
      const user = await createTestUser({ email: "s@test.com", username: "statsuser" });
      const res = await app.inject({ method: "GET", url: `/api/users/${user.id}/stats` });
      expect(res.statusCode).toBe(200);
      const body = res.json() as any;
      expect(body.totalGames).toBe(0);
      expect(body.streaks).toBeDefined();
      expect(body.form).toBeDefined();
    });

    it("returns 404 for non-existent user", async () => {
      const res = await app.inject({ method: "GET", url: "/api/users/99999/stats" });
      expect(res.statusCode).toBe(404);
    });
  });

  // ─── GET /api/users/:id/games ─────────────────────────────────────

  describe("GET /api/users/:id/games", () => {
    it("returns empty list for user with no games", async () => {
      const user = await createTestUser({ email: "g@test.com", username: "gameuser" });
      const res = await app.inject({ method: "GET", url: `/api/users/${user.id}/games` });
      expect(res.statusCode).toBe(200);
      const body = res.json() as any;
      expect(body).toEqual([]);
    });

    it("returns 404 for non-existent user", async () => {
      const res = await app.inject({ method: "GET", url: "/api/users/99999/games" });
      expect(res.statusCode).toBe(404);
    });
  });

  // ─── GET /api/users/search ────────────────────────────────────────

  describe("GET /api/users/search", () => {
    it("returns matching users", async () => {
      await createTestUser({ email: "a@test.com", username: "alice_search" });
      await createTestUser({ email: "b@test.com", username: "bob_search" });
      const user = await createTestUser({ email: "c@test.com", username: "charlie_search" });
      const { cookie } = loginAs(user.id);
      const res = await app.inject({
        method: "GET",
        url: "/api/users/search?q=search",
        headers: { cookie },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as any;
      expect(body.length).toBe(3);
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({ method: "GET", url: "/api/users/search?q=test" });
      expect(res.statusCode).toBe(401);
    });

    it("returns empty array for empty query", async () => {
      const user = await createTestUser({ email: "a@test.com", username: "a" });
      const { cookie } = loginAs(user.id);
      const res = await app.inject({
        method: "GET",
        url: "/api/users/search",
        headers: { cookie },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as any;
      expect(body).toEqual([]);
    });
  });
});
