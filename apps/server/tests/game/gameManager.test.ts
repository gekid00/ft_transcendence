import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { truncateAll, createTestUser, createGame } from "../helpers.js";
import { gameManager } from "../../src/game/gameManager.js";
import { db } from "../../src/db/client.js";
import { games as gamesTable } from "../../src/db/schema.js";
import { eq } from "drizzle-orm";
import type { Server } from "socket.io";

function createMockIO(): Server {
  const emitted: { room: string; event: string; data: any }[] = [];
  const mockRoom = {
    emit: vi.fn((event: string, data: any) => {
      emitted.push({ room: "game", event, data });
    }),
  };
  const mockIo = {
    to: vi.fn(() => mockRoom),
    emit: vi.fn(),
    sockets: {
      adapter: {
        rooms: new Map<string, Set<string>>(),
      },
    },
    _emitted: emitted,
    _mockRoom: mockRoom,
  } as unknown as Server;
  return mockIo;
}

describe("GameManager", () => {
  beforeEach(async () => {
    await truncateAll();
    gameManager.setIO(createMockIO());
  });

  afterEach(async () => {
    gameManager["games"].clear();
  });

  // ─── createGame ──────────────────────────────────────────────────

  describe("createGame", () => {
    it("creates a game and stores it", async () => {
      const user1 = await createTestUser({ email: "p1@test.com", username: "p1" });
      const user2 = await createTestUser({ email: "p2@test.com", username: "p2" });

      const active = gameManager.createGame({
        gameId: 1,
        player1Id: user1.id,
        player2Id: user2.id,
        timePerPlayerSeconds: 180,
        isAi: false,
      });

      expect(active).toBeDefined();
      expect(active.state).toBeDefined();
      expect(gameManager.get(1)).toBe(active);
    });

    it("creates an AI game", async () => {
      const user = await createTestUser({ email: "ai@test.com", username: "ai" });

      const active = gameManager.createGame({
        gameId: 2,
        player1Id: user.id,
        player2Id: null,
        timePerPlayerSeconds: 180,
        isAi: true,
        aiDifficulty: "medium",
      });

      expect(active.isAi).toBe(true);
      expect(active.aiDifficulty).toBe("medium");
    });

    it("throws if io is not set", () => {
      gameManager.setIO(null as unknown as Server);
      expect(() =>
        gameManager.createGame({
          gameId: 99,
          player1Id: 1,
          player2Id: 2,
          timePerPlayerSeconds: 180,
          isAi: false,
        })
      ).toThrow("gameManager: setIO must be called before createGame");
    });
  });

  // ─── applyMove ───────────────────────────────────────────────────

  describe("applyMove", () => {
    it("applies a valid move", async () => {
      const user1 = await createTestUser({ email: "p1@test.com", username: "p1" });
      const user2 = await createTestUser({ email: "p2@test.com", username: "p2" });
      await createGame({ player1Id: user1.id, player2Id: user2.id, status: "in_progress" });

      const game = (await db.select().from(gamesTable).limit(1))[0];

      gameManager.createGame({
        gameId: game.id,
        player1Id: user1.id,
        player2Id: user2.id,
        timePerPlayerSeconds: 180,
        isAi: false,
      });

      const result = await gameManager.applyMove(game.id, user1.id, 3);
      expect(result.ok).toBe(true);
    });

    it("rejects move from wrong player", async () => {
      const user1 = await createTestUser({ email: "p1@test.com", username: "p1" });
      const user2 = await createTestUser({ email: "p2@test.com", username: "p2" });
      await createGame({ player1Id: user1.id, player2Id: user2.id, status: "in_progress" });

      const game = (await db.select().from(gamesTable).limit(1))[0];

      gameManager.createGame({
        gameId: game.id,
        player1Id: user1.id,
        player2Id: user2.id,
        timePerPlayerSeconds: 180,
        isAi: false,
      });

      const result = await gameManager.applyMove(game.id, user2.id, 3);
      expect(result.ok).toBe(false);
      expect(result.error).toBe("not your turn");
    });

    it("rejects move from non-player", async () => {
      const user1 = await createTestUser({ email: "p1@test.com", username: "p1" });
      const user2 = await createTestUser({ email: "p2@test.com", username: "p2" });
      const outsider = await createTestUser({ email: "o@test.com", username: "outsider" });
      await createGame({ player1Id: user1.id, player2Id: user2.id, status: "in_progress" });

      const game = (await db.select().from(gamesTable).limit(1))[0];

      gameManager.createGame({
        gameId: game.id,
        player1Id: user1.id,
        player2Id: user2.id,
        timePerPlayerSeconds: 180,
        isAi: false,
      });

      const result = await gameManager.applyMove(game.id, outsider.id, 3);
      expect(result.ok).toBe(false);
      expect(result.error).toBe("not a player");
    });

    it("rejects move on non-existent game", async () => {
      const result = await gameManager.applyMove(999, 1, 3);
      expect(result.ok).toBe(false);
      expect(result.error).toBe("game not found");
    });

    it("rejects invalid column", async () => {
      const user1 = await createTestUser({ email: "p1@test.com", username: "p1" });
      const user2 = await createTestUser({ email: "p2@test.com", username: "p2" });
      await createGame({ player1Id: user1.id, player2Id: user2.id, status: "in_progress" });

      const game = (await db.select().from(gamesTable).limit(1))[0];

      gameManager.createGame({
        gameId: game.id,
        player1Id: user1.id,
        player2Id: user2.id,
        timePerPlayerSeconds: 180,
        isAi: false,
      });

      const result = await gameManager.applyMove(game.id, user1.id, 99);
      expect(result.ok).toBe(false);
    });
  });

  // ─── surrender ───────────────────────────────────────────────────

  describe("surrender", () => {
    it("surrenders the game", async () => {
      const user1 = await createTestUser({ email: "p1@test.com", username: "p1" });
      const user2 = await createTestUser({ email: "p2@test.com", username: "p2" });
      await createGame({ player1Id: user1.id, player2Id: user2.id, status: "in_progress" });

      const game = (await db.select().from(gamesTable).limit(1))[0];

      gameManager.createGame({
        gameId: game.id,
        player1Id: user1.id,
        player2Id: user2.id,
        timePerPlayerSeconds: 180,
        isAi: false,
      });

      await gameManager.surrender(game.id, user1.id);
      // After surrender, finishGame removes the game from memory and updates DB
      const [updated] = await db.select().from(gamesTable).where(eq(gamesTable.id, game.id));
      expect(updated.status).toBe("abandoned");
      expect(updated.winnerId).toBe(user2.id);
    });
  });

  // ─── onDisconnect / onReconnect ──────────────────────────────────

  describe("onDisconnect / onReconnect", () => {
    it("starts a disconnect timer on disconnect", async () => {
      const user1 = await createTestUser({ email: "p1@test.com", username: "p1" });
      const user2 = await createTestUser({ email: "p2@test.com", username: "p2" });
      await createGame({ player1Id: user1.id, player2Id: user2.id, status: "in_progress" });

      const game = (await db.select().from(gamesTable).limit(1))[0];

      gameManager.createGame({
        gameId: game.id,
        player1Id: user1.id,
        player2Id: user2.id,
        timePerPlayerSeconds: 180,
        isAi: false,
      });

      gameManager.onDisconnect(user1.id);
      const active = gameManager.get(game.id);
      expect(active?.disconnectTimers.has(user1.id)).toBe(true);
    });

    it("cancels disconnect timer on reconnect", async () => {
      const user1 = await createTestUser({ email: "p1@test.com", username: "p1" });
      const user2 = await createTestUser({ email: "p2@test.com", username: "p2" });
      await createGame({ player1Id: user1.id, player2Id: user2.id, status: "in_progress" });

      const game = (await db.select().from(gamesTable).limit(1))[0];

      gameManager.createGame({
        gameId: game.id,
        player1Id: user1.id,
        player2Id: user2.id,
        timePerPlayerSeconds: 180,
        isAi: false,
      });

      gameManager.onDisconnect(user1.id);
      const restored = gameManager.onReconnect(user1.id);
      expect(restored).toContain(game.id);
      const active = gameManager.get(game.id);
      expect(active?.disconnectTimers.has(user1.id)).toBe(false);
    });

    it("does not start disconnect timer for AI games", async () => {
      const user = await createTestUser({ email: "ai@test.com", username: "ai" });
      await createGame({ player1Id: user.id, player2Id: null, status: "in_progress", isAiOpponent: true });

      const game = (await db.select().from(gamesTable).limit(1))[0];

      gameManager.createGame({
        gameId: game.id,
        player1Id: user.id,
        player2Id: null,
        timePerPlayerSeconds: 180,
        isAi: true,
      });

      gameManager.onDisconnect(user.id);
      const active = gameManager.get(game.id);
      expect(active?.disconnectTimers.has(user.id)).toBe(false);
    });
  });

  // ─── get / getOrRestore ──────────────────────────────────────────

  describe("get / getOrRestore", () => {
    it("returns undefined for non-existent game", () => {
      expect(gameManager.get(999)).toBeUndefined();
    });

    it("returns the game if in memory", async () => {
      const user1 = await createTestUser({ email: "p1@test.com", username: "p1" });
      const user2 = await createTestUser({ email: "p2@test.com", username: "p2" });
      await createGame({ player1Id: user1.id, player2Id: user2.id, status: "in_progress" });

      const game = (await db.select().from(gamesTable).limit(1))[0];

      gameManager.createGame({
        gameId: game.id,
        player1Id: user1.id,
        player2Id: user2.id,
        timePerPlayerSeconds: 180,
        isAi: false,
      });

      const result = await gameManager.getOrRestore(game.id);
      expect(result).toBeDefined();
    });
  });
});
