import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildTestApp, truncateAll, createTestUser, loginAs, extractAuthCookie } from "../helpers.js";

describe("Auth routes", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeEach(async () => {
    await truncateAll();
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  // ─── POST /api/auth/signup ───────────────────────────────────────

  describe("POST /api/auth/signup", () => {
    it("creates a user and returns 201", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/signup",
        payload: { email: "new@test.com", username: "newuser", password: "password123" },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json() as any;
      expect(body.id).toBeDefined();
      expect(body.email).toBe("new@test.com");
      expect(body.username).toBe("newuser");
    });

    it("sets an auth cookie on signup", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/signup",
        payload: { email: "new@test.com", username: "newuser", password: "password123" },
      });
      const cookie = extractAuthCookie(res);
      expect(cookie).toBeTruthy();
      expect(cookie).toMatch(/^auth_token=/);
    });

    it("does not return password in response", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/signup",
        payload: { email: "new@test.com", username: "newuser", password: "password123" },
      });
      const body = res.json() as any;
      expect(body.password).toBeUndefined();
    });

    it("returns 400 if missing fields", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/signup",
        payload: { email: "new@test.com" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 400 if password is shorter than 8 chars", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/signup",
        payload: { email: "new@test.com", username: "newuser", password: "short" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 409 if email is already taken", async () => {
      await createTestUser({ email: "taken@test.com", username: "user1" });
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/signup",
        payload: { email: "taken@test.com", username: "user2", password: "password123" },
      });
      expect(res.statusCode).toBe(409);
    });

    it("returns 409 if username is already taken", async () => {
      await createTestUser({ email: "a@test.com", username: "taken_name" });
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/signup",
        payload: { email: "b@test.com", username: "taken_name", password: "password123" },
      });
      expect(res.statusCode).toBe(409);
    });
  });

  // ─── POST /api/auth/login ────────────────────────────────────────

  describe("POST /api/auth/login", () => {
    it("logs in with correct credentials", async () => {
      await createTestUser({ email: "login@test.com", username: "loginuser", password: "password123" });
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "login@test.com", password: "password123" },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as any;
      expect(body.username).toBe("loginuser");
    });

    it("sets an auth cookie on login", async () => {
      await createTestUser({ email: "login@test.com", username: "loginuser", password: "password123" });
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "login@test.com", password: "password123" },
      });
      const cookie = extractAuthCookie(res);
      expect(cookie).toBeTruthy();
    });

    it("returns 401 with wrong password", async () => {
      await createTestUser({ email: "login@test.com", username: "loginuser", password: "password123" });
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "login@test.com", password: "wrongpassword" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("returns 401 with non-existent email", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "nobody@test.com", password: "password123" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("returns 400 if missing fields", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "login@test.com" },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ─── POST /api/auth/logout ───────────────────────────────────────

  describe("POST /api/auth/logout", () => {
    it("clears the auth cookie", async () => {
      const user = await createTestUser({ email: "a@test.com", username: "a" });
      const { cookie } = loginAs(user.id);
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/logout",
        headers: { cookie },
      });
      expect(res.statusCode).toBe(200);
      // The response should clear the cookie
      const setCookie = res.headers["set-cookie"];
      expect(setCookie).toBeTruthy();
    });

    it("returns JSON for non-HTML requests", async () => {
      const user = await createTestUser({ email: "a@test.com", username: "a" });
      const { cookie } = loginAs(user.id);
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/logout",
        headers: { cookie, accept: "application/json" },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as any;
      expect(body.message).toBe("Logged out");
    });

    it("redirects for HTML form requests", async () => {
      const user = await createTestUser({ email: "a@test.com", username: "a" });
      const { cookie } = loginAs(user.id);
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/logout",
        headers: { cookie, accept: "text/html" },
      });
      expect(res.statusCode).toBe(302);
    });
  });

  // ─── GET /api/auth/me ────────────────────────────────────────────

  describe("GET /api/auth/me", () => {
    it("returns current user with valid token", async () => {
      const user = await createTestUser({ email: "me@test.com", username: "meuser" });
      const { cookie } = loginAs(user.id);
      const res = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { cookie },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as any;
      expect(body.username).toBe("meuser");
      expect(body.email).toBe("me@test.com");
    });

    it("returns 401 without token", async () => {
      const res = await app.inject({ method: "GET", url: "/api/auth/me" });
      expect(res.statusCode).toBe(401);
    });

    it("returns 401 with invalid token", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { cookie: "auth_token=invalid.token.here" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("sanitizes legacy pawn skin names", async () => {
      const user = await createTestUser({ email: "skin@test.com", username: "skinuser" });
      // Directly update the DB with a legacy skin name
      const { db } = await import("../../src/db/client.js");
      const { users } = await import("../../src/db/schema.js");
      const { eq } = await import("drizzle-orm");
      await db.update(users).set({ pawnSkin: "wine" }).where(eq(users.id, user.id));

      const { cookie } = loginAs(user.id);
      const res = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { cookie },
      });
      const body = res.json() as any;
      expect(body.pawnSkin).toBe("royal");
    });
  });

  // ─── POST /api/auth/signup-complete ──────────────────────────────

  describe("POST /api/auth/signup-complete", () => {
    it("marks signupCompletedAt", async () => {
      const user = await createTestUser({ email: "sc@test.com", username: "scuser" });
      const { cookie } = loginAs(user.id);
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/signup-complete",
        headers: { cookie },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as any;
      expect(body.ok).toBe(true);
    });

    it("is idempotent", async () => {
      const user = await createTestUser({ email: "sc@test.com", username: "scuser" });
      const { cookie } = loginAs(user.id);
      await app.inject({
        method: "POST",
        url: "/api/auth/signup-complete",
        headers: { cookie },
      });
      // Second call should also succeed
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/signup-complete",
        headers: { cookie },
      });
      expect(res.statusCode).toBe(200);
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/signup-complete",
      });
      expect(res.statusCode).toBe(401);
    });
  });
});
