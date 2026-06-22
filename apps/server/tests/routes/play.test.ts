import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildTestApp, truncateAll, createTestUser, loginAs } from "../helpers.js";
import { db } from "../../src/db/client.js";
import { lobbies } from "../../src/db/schema.js";
import { eq } from "drizzle-orm";

describe("Play routes (anonymous)", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeEach(async () => {
    await truncateAll();
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  // ─── POST /api/play/start ─────────────────────────────────────────

  describe("POST /api/play/start", () => {
    it("creates a new game session", async () => {
      const res = await app.inject({ method: "POST", url: "/api/play/start" });
      expect(res.statusCode).toBe(200);
      const body = res.json() as any;
      expect(body.state).toBeDefined();
      expect(body.state.status).toBe("in_progress");
      expect(body.state.board).toHaveLength(6);
      expect(body.state.board[0]).toHaveLength(7);
    });

    it("sets a session cookie", async () => {
      const res = await app.inject({ method: "POST", url: "/api/play/start" });
      const setCookie = res.headers["set-cookie"];
      expect(setCookie).toBeTruthy();
    });
  });

  // ─── GET /api/play/state ──────────────────────────────────────────

  describe("GET /api/play/state", () => {
    it("returns 401 without session", async () => {
      const res = await app.inject({ method: "GET", url: "/api/play/state" });
      expect(res.statusCode).toBe(401);
    });

    it("returns state for active session", async () => {
      const start = await app.inject({ method: "POST", url: "/api/play/start" });
      const cookie = start.headers["set-cookie"];
      const token = (Array.isArray(cookie) ? cookie[0] : cookie)?.split(";")[0];
      const res = await app.inject({
        method: "GET",
        url: "/api/play/state",
        headers: { cookie: token },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as any;
      expect(body.state.status).toBe("in_progress");
    });
  });

  // ─── POST /api/play/move ──────────────────────────────────────────

  describe("POST /api/play/move", () => {
    it("makes a valid move", async () => {
      const start = await app.inject({ method: "POST", url: "/api/play/start" });
      const cookie = start.headers["set-cookie"];
      const token = (Array.isArray(cookie) ? cookie[0] : cookie)?.split(";")[0];
      const res = await app.inject({
        method: "POST",
        url: "/api/play/move",
        headers: { cookie: token },
        payload: { col: 3 },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as any;
      expect(body.state).toBeDefined();
      expect(body.aiMove).toBeDefined();
    });

    it("returns 400 for invalid column", async () => {
      const start = await app.inject({ method: "POST", url: "/api/play/start" });
      const cookie = start.headers["set-cookie"];
      const token = (Array.isArray(cookie) ? cookie[0] : cookie)?.split(";")[0];
      const res = await app.inject({
        method: "POST",
        url: "/api/play/move",
        headers: { cookie: token },
        payload: { col: 10 },
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 401 without session", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/play/move",
        payload: { col: 3 },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ─── POST /api/play/reset ─────────────────────────────────────────

  describe("POST /api/play/reset", () => {
    it("resets the game", async () => {
      const start = await app.inject({ method: "POST", url: "/api/play/start" });
      const cookie = start.headers["set-cookie"];
      const token = (Array.isArray(cookie) ? cookie[0] : cookie)?.split(";")[0];
      // Make a move
      await app.inject({
        method: "POST",
        url: "/api/play/move",
        headers: { cookie: token },
        payload: { col: 0 },
      });
      // Reset
      const res = await app.inject({
        method: "POST",
        url: "/api/play/reset",
        headers: { cookie: token },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as any;
      expect(body.state.status).toBe("in_progress");
      // Board should be empty
      expect(body.state.board.flat().every((c: number) => c === 0)).toBe(true);
    });
  });
});
