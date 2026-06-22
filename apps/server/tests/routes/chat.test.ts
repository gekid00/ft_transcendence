import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildTestApp, truncateAll, createTestUser, loginAs, createChatMessage, createFriendship } from "../helpers.js";

describe("Chat routes", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeEach(async () => {
    await truncateAll();
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  // ─── GET /api/chat ────────────────────────────────────────────────

  describe("GET /api/chat", () => {
    it("returns empty list for new user", async () => {
      const user = await createTestUser({ email: "a@test.com", username: "a" });
      const { cookie } = loginAs(user.id);
      const res = await app.inject({ method: "GET", url: "/api/chat", headers: { cookie } });
      expect(res.statusCode).toBe(200);
      const body = res.json() as any;
      expect(body).toEqual([]);
    });

    it("returns conversations with last message", async () => {
      const user1 = await createTestUser({ email: "a@test.com", username: "alice_chat" });
      const user2 = await createTestUser({ email: "b@test.com", username: "bob_chat" });
      await createFriendship(user1.id, user2.id, "accepted");
      await createChatMessage(user1.id, user2.id, "Hello!");
      const { cookie } = loginAs(user1.id);
      const res = await app.inject({ method: "GET", url: "/api/chat", headers: { cookie } });
      const body = res.json() as any;
      expect(body.length).toBe(1);
      expect(body[0].username).toBe("bob_chat");
      expect(body[0].lastMessage).toBe("Hello!");
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({ method: "GET", url: "/api/chat" });
      expect(res.statusCode).toBe(401);
    });
  });

  // ─── GET /api/chat/:userId ────────────────────────────────────────

  describe("GET /api/chat/:userId", () => {
    it("returns message history", async () => {
      const user1 = await createTestUser({ email: "a@test.com", username: "alice_hist" });
      const user2 = await createTestUser({ email: "b@test.com", username: "bob_hist" });
      await createFriendship(user1.id, user2.id, "accepted");
      await createChatMessage(user1.id, user2.id, "Hi!");
      await createChatMessage(user2.id, user1.id, "Hey!");
      const { cookie } = loginAs(user1.id);
      const res = await app.inject({ method: "GET", url: `/api/chat/${user2.id}`, headers: { cookie } });
      expect(res.statusCode).toBe(200);
      const body = res.json() as any;
      expect(body.length).toBe(2);
    });

    it("returns 400 for invalid userId", async () => {
      const user = await createTestUser({ email: "a@test.com", username: "a" });
      const { cookie } = loginAs(user.id);
      const res = await app.inject({ method: "GET", url: "/api/chat/abc", headers: { cookie } });
      expect(res.statusCode).toBe(400);
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({ method: "GET", url: "/api/chat/1" });
      expect(res.statusCode).toBe(401);
    });
  });
});
