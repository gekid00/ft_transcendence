import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildTestApp, truncateAll, createTestUser, loginAs, createNotification } from "../helpers.js";

describe("Notifications routes", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeEach(async () => {
    await truncateAll();
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  // ─── GET /api/notifications ───────────────────────────────────────

  describe("GET /api/notifications", () => {
    it("returns empty list for new user", async () => {
      const user = await createTestUser({ email: "a@test.com", username: "a" });
      const { cookie } = loginAs(user.id);
      const res = await app.inject({ method: "GET", url: "/api/notifications", headers: { cookie } });
      expect(res.statusCode).toBe(200);
      const body = res.json() as any;
      expect(body).toEqual([]);
    });

    it("returns notifications for user", async () => {
      const user = await createTestUser({ email: "a@test.com", username: "notif_user" });
      await createNotification(user.id, "friend_request", { from: { id: 1 } });
      const { cookie } = loginAs(user.id);
      const res = await app.inject({ method: "GET", url: "/api/notifications", headers: { cookie } });
      const body = res.json() as any;
      expect(body.length).toBe(1);
      expect(body[0].type).toBe("friend_request");
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({ method: "GET", url: "/api/notifications" });
      expect(res.statusCode).toBe(401);
    });
  });

  // ─── GET /api/notifications/unread-count ──────────────────────────

  describe("GET /api/notifications/unread-count", () => {
    it("returns 0 for no notifications", async () => {
      const user = await createTestUser({ email: "a@test.com", username: "a" });
      const { cookie } = loginAs(user.id);
      const res = await app.inject({ method: "GET", url: "/api/notifications/unread-count", headers: { cookie } });
      expect(res.statusCode).toBe(200);
      const body = res.json() as any;
      expect(body.count).toBe(0);
    });

    it("counts only unread notifications", async () => {
      const user = await createTestUser({ email: "a@test.com", username: "a" });
      await createNotification(user.id, "chat_message", {});
      await createNotification(user.id, "chat_message", {});
      const { cookie } = loginAs(user.id);
      const res = await app.inject({ method: "GET", url: "/api/notifications/unread-count", headers: { cookie } });
      const body = res.json() as any;
      expect(body.count).toBe(2);
    });
  });

  // ─── PATCH /api/notifications/:id/read ────────────────────────────

  describe("PATCH /api/notifications/:id/read", () => {
    it("marks a notification as read", async () => {
      const user = await createTestUser({ email: "a@test.com", username: "a" });
      const notif = await createNotification(user.id, "chat_message", {});
      const { cookie } = loginAs(user.id);
      const res = await app.inject({
        method: "PATCH",
        url: `/api/notifications/${notif.id}/read`,
        headers: { cookie },
      });
      expect(res.statusCode).toBe(200);
      // Verify count is now 0
      const countRes = await app.inject({ method: "GET", url: "/api/notifications/unread-count", headers: { cookie } });
      const body = countRes.json() as any;
      expect(body.count).toBe(0);
    });

    it("returns 404 for non-existent notification", async () => {
      const user = await createTestUser({ email: "a@test.com", username: "a" });
      const { cookie } = loginAs(user.id);
      const res = await app.inject({
        method: "PATCH",
        url: "/api/notifications/99999/read",
        headers: { cookie },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ─── PATCH /api/notifications/read-all ────────────────────────────

  describe("PATCH /api/notifications/read-all", () => {
    it("marks all notifications as read", async () => {
      const user = await createTestUser({ email: "a@test.com", username: "a" });
      await createNotification(user.id, "chat_message", {});
      await createNotification(user.id, "friend_request", {});
      const { cookie } = loginAs(user.id);
      const res = await app.inject({
        method: "PATCH",
        url: "/api/notifications/read-all",
        headers: { cookie },
      });
      expect(res.statusCode).toBe(200);
      const countRes = await app.inject({ method: "GET", url: "/api/notifications/unread-count", headers: { cookie } });
      const body = countRes.json() as any;
      expect(body.count).toBe(0);
    });
  });

  // ─── DELETE /api/notifications ────────────────────────────────────

  describe("DELETE /api/notifications", () => {
    it("clears all notifications", async () => {
      const user = await createTestUser({ email: "a@test.com", username: "a" });
      await createNotification(user.id, "chat_message", {});
      await createNotification(user.id, "friend_request", {});
      const { cookie } = loginAs(user.id);
      const res = await app.inject({
        method: "DELETE",
        url: "/api/notifications",
        headers: { cookie },
      });
      expect(res.statusCode).toBe(200);
      const listRes = await app.inject({ method: "GET", url: "/api/notifications", headers: { cookie } });
      const body = listRes.json() as any;
      expect(body).toEqual([]);
    });
  });
});
