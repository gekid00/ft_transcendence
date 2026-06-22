// Routes utilisateurs : profils publics, recherche, lecture/édition de son propre profil.
//
// GET  /api/users/:id              — profil public d'un user (n'importe qui peut le voir)
// GET  /api/users/by-username/:username — idem, mais par username (pour les URLs /profile/<username>)
// GET  /api/users/check-username   — vérifie si un username est dispo (UNAUTH, pour le signup)
// GET  /api/users/search           — recherche par username (auth requise)
// GET  /api/profile                — son propre profil (avec email, infos privées)
// PUT  /api/profile                — édite son propre profil (username, bio, skins)
// PUT  /api/profile/email          — change l'email (re-auth : current password requis)
// PUT  /api/profile/password       — change le password (re-auth : current password requis)
// POST /api/profile/avatar         — upload un avatar (JPG/PNG/WebP, max 2 MB, resize 500x500)
// DELETE /api/profile              — anonymise le compte (is_deleted = true, garde l'historique)

import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { eq, ilike, and, or, desc, asc, sql, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { users, games, moves } from "../db/schema.js";
import { requireAuth } from "../auth/middleware.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { titleForRating } from "../game/elo.js";
import { sendError } from "../lib/errors.js";
import { getUserRank } from "../lib/rank.js";
import {
  updateProfileSchema,
  updateEmailSchema,
  updatePasswordSchema,
  userSearchSchema,
  usernameCheckSchema,
  userGamesSchema,
  userStatsSchema,
} from "../schemas/users.js";
import { idParamSchema } from "../schemas/common.js";

// Dossier de destination des avatars (créé au démarrage par server.ts).
const AVATARS_DIR = join(import.meta.dirname, "..", "..", "uploads", "avatars");
const ALLOWED_MIMETYPES = ["image/jpeg", "image/png", "image/webp"];
const ALLOWED_PAWN_SKINS = ["default", "sunset", "royal", "forest"] as const;
const ALLOWED_GRID_SKINS = ["liquid-glass", "frosted-obsidian"] as const;
const BIO_MAX_LEN = 160;

function sanitizeSkins(pawnSkin: string, gridSkin: string) {
  let pSkin = pawnSkin;
  if (pSkin === "wine") pSkin = "royal";
  else if (pSkin === "coral") pSkin = "sunset";
  else if (pSkin === "brick") pSkin = "forest";
  else if (!ALLOWED_PAWN_SKINS.includes(pSkin as any)) pSkin = "default";

  let gSkin = gridSkin;
  if (gSkin === "default") gSkin = "frosted-obsidian";
  else if (!ALLOWED_GRID_SKINS.includes(gSkin as any)) gSkin = "liquid-glass";

  return { pawnSkin: pSkin, gridSkin: gSkin };
}

// Construit la réponse publique d'un profil user. Même shape pour /users/:id
// et /users/by-username/:username — comme ça le front a un seul `User` type
// à typer des deux côtés. Renvoie un placeholder minimal "Joueur supprimé"
// quand `isDeleted` est vrai, pour préserver la cohérence de l'historique
// des parties (cf. DELETE /api/profile).
async function publicProfilePayload(user: typeof users.$inferSelect) {
  if (user.isDeleted) {
    return {
      id: user.id,
      username: "Joueur supprimé",
      avatarUrl: null as string | null,
    };
  }

  const rank = await getUserRank(user.rating, user.peakRating, user.id);
  return {
    id: user.id,
    username: user.username,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    status: user.status,
    gamesPlayed: user.gamesPlayed,
    gamesWon: user.gamesWon,
    gamesLost: user.gamesLost,
    gamesDrawn: user.gamesDrawn,
    rating: user.rating,
    peakRating: user.peakRating,
    rank,
    title: titleForRating(user.rating),
    createdAt: user.createdAt.toISOString(),
  };
}

export async function userRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>(
    "/users/:id",
    { schema: { params: idParamSchema } },
    async (request, reply) => {
    // Profil public : pas besoin d'être connecté pour voir.
    const id = Number(request.params.id);
    if (isNaN(id)) return reply.code(400).send({ error: "Invalid id" });

    const [user] = await db.select().from(users).where(eq(users.id, id));
    if (!user) return reply.code(404).send({ error: "User not found" });

    return reply.send(await publicProfilePayload(user));
  });

  app.get<{ Params: { username: string } }>(
    "/users/by-username/:username",
    async (request, reply) => {
      // Profil public lookupé par username — utilisé par la future page
      // /profile/<username> (côté front, dynamic route Astro). Pas d'auth :
      // un profil public reste public, comme via /users/:id.
      //
      // URLs sensibles à la casse : on stocke en `eq` (case-sensitive) comme
      // le reste du schéma. /users/by-username/sarah_w ≠ /users/by-username/Sarah_w.
      // C'est volontaire et aligné avec /users/check-username (cf. signup).
      const username = request.params.username?.trim();
      if (!username) return reply.code(404).send({ error: "User not found" });

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.username, username));
      if (!user) return reply.code(404).send({ error: "User not found" });

      return reply.send(await publicProfilePayload(user));
    }
  );

  app.get<{ Querystring: { q?: string } }>(
    "/users/check-username",
    { schema: { querystring: usernameCheckSchema } },
    async (request, reply) => {
      // Public endpoint used by the signup form to live-check username availability.
      // Returns just { available: boolean } — no other user data leaked.
      //
      // TODO(rate-limit): once @fastify/rate-limit is wired into the server, gate this
      // (and signup/login) at something like 10 req/min/IP to mitigate enumeration.
      const q = request.query.q?.trim() ?? "";

      // Same constraints as signup: 3-30 chars, [a-zA-Z0-9_].
      // Invalid input → unavailable (don't tell the caller why; just block the form).
      const USERNAME_RE = /^[a-zA-Z0-9_]{3,30}$/;
      if (!USERNAME_RE.test(q)) {
        return reply.send({ available: false });
      }

      const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.username, q))
        .limit(1);

      return reply.send({ available: existing.length === 0 });
    },
  );

  app.get<{ Querystring: { q?: string } }>(
    "/users/search",
    { preHandler: requireAuth, schema: { querystring: userSearchSchema } },
    async (request, reply) => {
      // Recherche par username (insensible à la casse, contient la chaîne).
      const q = request.query.q?.trim();
      if (!q) return reply.send([]);

      const results = await db
        .select({
          id: users.id,
          username: users.username,
          avatarUrl: users.avatarUrl,
          status: users.status,
        })
        .from(users)
        .where(ilike(users.username, `%${q}%`))
        .limit(20);

      return reply.send(results);
    }
  );

    app.get(
    "/profile",
    { preHandler: requireAuth },
    async (request, reply) => {
      // Son propre profil : inclut l'email (info privée).
      const [user] = await db.select().from(users).where(eq(users.id, request.userId!));
      if (!user) return reply.code(404).send({ error: "User not found" });

      const rank = await getUserRank(user.rating, user.peakRating, user.id);
      const sanitized = sanitizeSkins(user.pawnSkin, user.gridSkin);
      return reply.send({
        id: user.id,
        email: user.email,
        username: user.username,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
        pawnSkin: sanitized.pawnSkin,
        gridSkin: sanitized.gridSkin,
        oauth42Linked: user.oauth42Id !== null,
        rating: user.rating,
        peakRating: user.peakRating,
        gamesPlayed: user.gamesPlayed,
        rank,
        title: titleForRating(user.rating),
        // ISO 8601 or null. null for OAuth-only accounts that have
        // never set a password. Surfaced in /settings as "Last changed".
        passwordChangedAt: user.passwordChangedAt?.toISOString() ?? null,
      });
    }
  );

  app.put<{ Body: { username?: string; bio?: string; pawnSkin?: string; gridSkin?: string } }>(
    "/profile",
    { preHandler: requireAuth, schema: { body: updateProfileSchema } },
    async (request, reply) => {
      // Édite username, bio, skins. Email et password ont leurs propres routes (re-auth).
      const { username, bio, pawnSkin, gridSkin } = request.body;
      const updates: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };

      if (username !== undefined) {
        // Same regex as the signup endpoint to keep usernames consistent.
        if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
          return reply.code(400).send({
            error: "Username must be 3-30 chars (letters, numbers, underscore)",
          });
        }
        // Vérifie l'unicité du nouveau username.
        const existing = await db.select().from(users).where(eq(users.username, username));
        if (existing.length > 0 && existing[0].id !== request.userId) {
          return reply.code(409).send({ error: "Username already taken" });
        }
        updates.username = username;
      }
      if (bio !== undefined) {
        if (typeof bio !== "string" || bio.length > BIO_MAX_LEN) {
          return reply.code(400).send({ error: `Bio must be ≤ ${BIO_MAX_LEN} chars` });
        }
        updates.bio = bio;
      }
      if (pawnSkin !== undefined) {
        if (!ALLOWED_PAWN_SKINS.includes(pawnSkin as (typeof ALLOWED_PAWN_SKINS)[number])) {
          return reply.code(400).send({
            error: `Invalid pawnSkin. Allowed: ${ALLOWED_PAWN_SKINS.join(", ")}`,
          });
        }
        updates.pawnSkin = pawnSkin;
      }
      if (gridSkin !== undefined) {
        if (!ALLOWED_GRID_SKINS.includes(gridSkin as (typeof ALLOWED_GRID_SKINS)[number])) {
          return reply.code(400).send({
            error: `Invalid gridSkin. Allowed: ${ALLOWED_GRID_SKINS.join(", ")}`,
          });
        }
        updates.gridSkin = gridSkin;
      }

      const [updated] = await db
        .update(users)
        .set(updates)
        .where(eq(users.id, request.userId!))
        .returning();

      const sanitized = sanitizeSkins(updated.pawnSkin, updated.gridSkin);
      return reply.send({
        id: updated.id,
        username: updated.username,
        bio: updated.bio,
        pawnSkin: sanitized.pawnSkin,
        gridSkin: sanitized.gridSkin,
      });
    }
  );

  app.put<{ Body: { currentPassword: string; newEmail: string } }>(
    "/profile/email",
    { preHandler: requireAuth, schema: { body: updateEmailSchema } },
    async (request, reply) => {
      // Re-auth obligatoire : on demande le mot de passe actuel avant de changer l'email.
      const { currentPassword, newEmail } = request.body;
      if (!currentPassword || !newEmail) {
        return sendError(reply, 400, "INVALID_BODY", "Missing fields");
      }

      const [user] = await db.select().from(users).where(eq(users.id, request.userId!));
      if (!user || !user.password) {
        // Compte OAuth-only : on bloque (faudrait d'abord set un password).
        return sendError(
          reply,
          400,
          "PASSWORD_REQUIRED",
          "Cannot change email without a password set",
        );
      }

      const valid = await verifyPassword(currentPassword, user.password);
      if (!valid) {
        return sendError(reply, 401, "WRONG_PASSWORD", "Wrong current password");
      }

      // Vérifie que le nouvel email n'est pas déjà pris par un autre user.
      const existing = await db.select().from(users).where(eq(users.email, newEmail));
      if (existing.length > 0 && existing[0].id !== request.userId) {
        return sendError(reply, 409, "EMAIL_IN_USE", "Email already in use");
      }

      await db
        .update(users)
        .set({ email: newEmail, updatedAt: new Date() })
        .where(eq(users.id, request.userId!));

      return reply.send({ email: newEmail });
    }
  );

  app.put<{ Body: { currentPassword: string; newPassword: string } }>(
    "/profile/password",
    { preHandler: requireAuth, schema: { body: updatePasswordSchema } },
    async (request, reply) => {
      // Re-auth obligatoire : on demande le mot de passe actuel avant de changer.
      const { currentPassword, newPassword } = request.body;
      if (!currentPassword || !newPassword) {
        return sendError(reply, 400, "INVALID_BODY", "Missing fields");
      }
      if (newPassword.length < 8) {
        return sendError(
          reply,
          400,
          "PASSWORD_TOO_SHORT",
          "Password must be at least 8 chars",
        );
      }

      const [user] = await db.select().from(users).where(eq(users.id, request.userId!));
      if (!user || !user.password) {
        return sendError(
          reply,
          400,
          "PASSWORD_REQUIRED",
          "Cannot change password without one set",
        );
      }

      const valid = await verifyPassword(currentPassword, user.password);
      if (!valid) {
        return sendError(reply, 401, "WRONG_PASSWORD", "Wrong current password");
      }

      // Refuse same-as-current. Defense in depth: the frontend also blocks
      // this client-side so the user gets the inline error before submit,
      // but the server enforces it too — never trust the client.
      if (await verifyPassword(newPassword, user.password)) {
        return sendError(
          reply,
          400,
          "PASSWORD_SAME_AS_CURRENT",
          "New password must be different from current password",
        );
      }

      const newHash = await hashPassword(newPassword);
      const now = new Date();
      await db
        .update(users)
        .set({
          password: newHash,
          passwordChangedAt: now,
          updatedAt: now,
        })
        .where(eq(users.id, request.userId!));

      return reply.send({ message: "Password updated", passwordChangedAt: now.toISOString() });
    }
  );

  app.post(
    "/profile/avatar",
    { preHandler: requireAuth },
    async (request, reply) => {
      // Récupère le fichier uploadé. @fastify/multipart's fileSize limit
      // (2 MB, set in server.ts) is enforced inside the busboy stream, so
      // request.file() throws a Fastify error with code FST_REQ_FILE_TOO_LARGE
      // (statusCode 413) before returning a usable stream. Without this
      // catch the request would still resolve to a typed 413 (Fastify's
      // default error handler), but in the bare `{ error, statusCode }`
      // shape — the frontend's typed-error switch wouldn't match and the
      // user would see the raw 'Payload Too Large' string. We catch it
      // and re-emit through sendError so the response carries our code.
      let data;
      try {
        data = await request.file();
      } catch (err) {
        const e = err as { statusCode?: number; code?: string };
        if (e.statusCode === 413 || e.code === "FST_REQ_FILE_TOO_LARGE") {
          return sendError(
            reply,
            413,
            "FILE_TOO_LARGE",
            "Image must be 2 MB or smaller.",
          );
        }
        throw err;
      }
      if (!data) {
        return sendError(reply, 400, "INVALID_FILE", "No file uploaded.");
      }

      // Vérifie le type MIME (le plugin a déjà coupé si > 2 MB).
      if (!ALLOWED_MIMETYPES.includes(data.mimetype)) {
        return sendError(
          reply,
          400,
          "INVALID_FILE",
          "Unsupported file type (JPG, PNG, WebP only).",
        );
      }

      // Lit tout le fichier en mémoire (OK car ≤ 2 MB).
      const buffer = await data.toBuffer();
      if (data.file.truncated) {
        return sendError(
          reply,
          400,
          "FILE_TOO_LARGE",
          "Image must be 2 MB or smaller.",
        );
      }

      // Redimensionne en 500x500 max (sans agrandir si plus petit) et convertit en webp.
      // Si l'image est corrompue / pas réellement un format supporté (extension
      // mensongère), sharp throw — on intercepte pour renvoyer 400 plutôt que 500.
      let processed: Buffer;
      try {
        processed = await sharp(buffer)
          .resize(500, 500, { fit: "cover", withoutEnlargement: true })
          .webp({ quality: 80 })
          .toBuffer();
      } catch (err) {
        request.log.warn({ err }, "avatar: sharp processing failed");
        return sendError(
          reply,
          400,
          "INVALID_FILE",
          "Couldn't read the image data — file may be corrupt.",
        );
      }

      // Sauvegarde sur disque. Nom de fichier = userId pour éviter les collisions.
      const filename = `${request.userId}.webp`;
      await writeFile(join(AVATARS_DIR, filename), processed);

      // URL publique avec un timestamp pour bust le cache du navigateur.
      const avatarUrl = `/uploads/avatars/${filename}?t=${Date.now()}`;
      await db
        .update(users)
        .set({ avatarUrl, updatedAt: new Date() })
        .where(eq(users.id, request.userId!));

      return reply.send({ avatarUrl });
    }
  );

  app.delete(
    "/profile",
    { preHandler: requireAuth },
    async (request, reply) => {
      // Anonymisation : on garde la ligne pour préserver l'historique des parties,
      // mais on efface les données perso et on marque is_deleted = true.
      // Le profil public renverra "Joueur supprimé" (cf. GET /api/users/:id).
      await db
        .update(users)
        .set({
          isDeleted: true,
          email: `deleted_${request.userId}@deleted.local`,
          username: `deleted_user_${request.userId}`,
          password: null,
          bio: null,
          avatarUrl: null,
          oauth42Id: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, request.userId!));

      // Déconnecte le user en effaçant son cookie.
      reply.clearCookie("auth_token", { path: "/" });
      return reply.send({ message: "Account deleted" });
    }
  );

  app.get<{ Params: { id: string }; Querystring: { limit?: string; offset?: string } }>(
    "/users/:id/games",
    { schema: { params: idParamSchema, querystring: userGamesSchema } },
    async (request, reply) => {
      const userId = Number(request.params.id);
      if (isNaN(userId)) return reply.code(400).send({ error: "Invalid user id" });

      const limit = Math.min(Number(request.query.limit ?? 20), 50);
      const offset = Number(request.query.offset ?? 0);

      const [userExists] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId));
      if (!userExists) return reply.code(404).send({ error: "User not found" });

      const userGames = await db
        .select()
        .from(games)
        .where(
          and(
            or(eq(games.player1Id, userId), eq(games.player2Id, userId)),
            or(eq(games.status, "finished"), eq(games.status, "abandoned"))
          )
        )
        .orderBy(desc(games.finishedAt))
        .limit(limit)
        .offset(offset);

      const results = [];

      for (const game of userGames) {
        const [moveCountRes] = await db
          .select({ count: sql<number>`count(*)` })
          .from(moves)
          .where(eq(moves.gameId, game.id));
        const moveCount = Number(moveCountRes?.count ?? 0);

        let opponentInfo = {
          id: null as number | null,
          username: "AI",
          avatarUrl: null as string | null,
          rating: 1000,
          isAi: true,
          aiDifficulty: null as string | null,
        };

        if (game.isAiOpponent) {
          opponentInfo.aiDifficulty = game.aiDifficulty;
          opponentInfo.username = `AI (${game.aiDifficulty || "medium"})`;
          if (game.aiDifficulty === "easy") opponentInfo.rating = 800;
          else if (game.aiDifficulty === "hard") opponentInfo.rating = 1800;
          else opponentInfo.rating = 1200;
        } else {
          const oppId = game.player1Id === userId ? game.player2Id : game.player1Id;
          if (oppId !== null) {
            const [opp] = await db.select().from(users).where(eq(users.id, oppId));
            if (opp) {
              if (opp.isDeleted) {
                opponentInfo = {
                  id: opp.id,
                  username: "Joueur supprimé",
                  avatarUrl: null,
                  rating: 1000,
                  isAi: false,
                  aiDifficulty: null,
                };
              } else {
                opponentInfo = {
                  id: opp.id,
                  username: opp.username,
                  avatarUrl: opp.avatarUrl,
                  rating: opp.rating,
                  isAi: false,
                  aiDifficulty: null,
                };
              }
            }
          }
        }

        let result: "win" | "loss" | "draw" = "draw";
        if (game.winnerId === userId) {
          result = "win";
        } else if (game.winnerId !== null) {
          result = "loss";
        }

        let detail = "";
        if (game.status === "abandoned") {
          detail = game.winnerId === userId ? "Opponent resigned" : "Resigned";
        } else {
          detail = `${result === "win" ? "Won" : result === "loss" ? "Lost" : "Draw"} in ${moveCount} moves`;
        }

        results.push({
          id: game.id,
          mode: game.mode,
          finishedAt: game.finishedAt ? game.finishedAt.toISOString() : null,
          result,
          detail,
          moveCount,
          timePerPlayerSeconds: game.timePerPlayerSeconds,
          opponent: opponentInfo,
        });
      }

      return reply.send(results);
    }
  );

  app.get<{ Params: { id: string }; Querystring: { is_ai?: string; difficulty?: string } }>(
    "/users/:id/stats",
    { schema: { params: idParamSchema, querystring: userStatsSchema } },
    async (request, reply) => {
      const userId = Number(request.params.id);
      if (isNaN(userId)) return reply.code(400).send({ error: "Invalid user id" });

      const { is_ai, difficulty } = request.query || {};

      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) return reply.code(404).send({ error: "User not found" });

      const conditions = [
        or(eq(games.player1Id, userId), eq(games.player2Id, userId)),
        or(eq(games.status, "finished"), eq(games.status, "abandoned"))
      ];

      if (is_ai === "true") {
        conditions.push(eq(games.isAiOpponent, true));
      } else if (is_ai === "false") {
        conditions.push(eq(games.isAiOpponent, false));
      }

      if (difficulty) {
        conditions.push(eq(games.aiDifficulty, difficulty as any));
      }

      const userGames = await db
        .select()
        .from(games)
        .where(and(...conditions))
        .orderBy(asc(games.finishedAt));

      let currentStreak = 0;
      let longestStreak = 0;
      let runningStreak = 0;

      for (const game of userGames) {
        if (game.winnerId === userId) {
          runningStreak++;
          longestStreak = Math.max(longestStreak, runningStreak);
        } else {
          runningStreak = 0;
        }
      }

      for (let i = userGames.length - 1; i >= 0; i--) {
        const game = userGames[i];
        if (game.winnerId === userId) {
          currentStreak++;
        } else {
          break;
        }
      }

      const last10Games = userGames.slice(-10);
      const form = last10Games.map((game) => {
        if (game.winnerId === userId) return "win";
        if (game.winnerId === null) return "draw";
        return "loss";
      });

      const timeControlBuckets = [
        { label: "Bullet", duration: "3 min", seconds: 180 },
        { label: "Blitz", duration: "10 min", seconds: 600 },
        { label: "Daily", duration: "60 min", seconds: 3600 },
      ];

      const byTimeControl = timeControlBuckets.map((tc) => {
        const gamesInTc = userGames.filter((g) => g.timePerPlayerSeconds === tc.seconds);
        const played = gamesInTc.length;
        const won = gamesInTc.filter((g) => g.winnerId === userId).length;
        const lost = gamesInTc.filter((g) => g.winnerId !== null && g.winnerId !== userId).length;
        const drawn = gamesInTc.filter((g) => g.winnerId === null).length;
        const winRate = played > 0 ? Number(((won / played) * 100).toFixed(1)) : 0.0;

        return {
          timePerPlayerSeconds: tc.seconds,
          label: tc.label,
          duration: tc.duration,
          played,
          won,
          lost,
          drawn,
          winRate,
        };
      });

      const opponentIds = Array.from(
        new Set(
          userGames
            .filter((g) => !g.isAiOpponent)
            .map((g) => (g.player1Id === userId ? g.player2Id : g.player1Id))
            .filter((id): id is number => id !== null)
        )
      );

      const opponentsData = opponentIds.length > 0
        ? await db.select({ id: users.id, rating: users.rating }).from(users).where(inArray(users.id, opponentIds))
        : [];

      const opponentRatingsMap = new Map(opponentsData.map((o) => [o.id, o.rating]));

      let lowerPlayed = 0, lowerWon = 0;
      let equalPlayed = 0, equalWon = 0;
      let higherPlayed = 0, higherWon = 0;

      const userRating = user.rating;

      for (const game of userGames) {
        let opponentRating = 1000;
        if (game.isAiOpponent) {
          if (game.aiDifficulty === "easy") opponentRating = 800;
          else if (game.aiDifficulty === "hard") opponentRating = 1800;
          else opponentRating = 1200;
        } else {
          const oppId = game.player1Id === userId ? game.player2Id : game.player1Id;
          opponentRating = (oppId !== null ? opponentRatingsMap.get(oppId) : null) ?? 1000;
        }

        const diff = opponentRating - userRating;
        const won = game.winnerId === userId;

        if (diff < -50) {
          lowerPlayed++;
          if (won) lowerWon++;
        } else if (diff > 50) {
          higherPlayed++;
          if (won) higherWon++;
        } else {
          equalPlayed++;
          if (won) equalWon++;
        }
      }

      const byOpponentStrength = [
        {
          bucket: "lower" as const,
          label: "Lower-rated",
          symbol: "↓",
          played: lowerPlayed,
          won: lowerWon,
          winRate: lowerPlayed > 0 ? Math.round((lowerWon / lowerPlayed) * 100) : 0,
        },
        {
          bucket: "equal" as const,
          label: "Equal-rated",
          symbol: "=",
          played: equalPlayed,
          won: equalWon,
          winRate: equalPlayed > 0 ? Math.round((equalWon / equalPlayed) * 100) : 0,
        },
        {
          bucket: "higher" as const,
          label: "Higher-rated",
          symbol: "↑",
          played: higherPlayed,
          won: higherWon,
          winRate: higherPlayed > 0 ? Math.round((higherWon / higherPlayed) * 100) : 0,
        },
      ];

      let totalSecondsPlayed = 0;
      for (const game of userGames) {
        if (game.finishedAt && game.startedAt) {
          totalSecondsPlayed += Math.floor((game.finishedAt.getTime() - game.startedAt.getTime()) / 1000);
        }
      }

      const wonGameIds = userGames.filter((g) => g.winnerId === userId).map((g) => g.id);
      let fastestWin = null;
      if (wonGameIds.length > 0) {
        const [fastest] = await db
          .select({ gameId: moves.gameId, moveCount: sql<number>`count(*)` })
          .from(moves)
          .where(inArray(moves.gameId, wonGameIds))
          .groupBy(moves.gameId)
          .orderBy(asc(sql`count(*)`))
          .limit(1);
        if (fastest) {
          const gameInfo = userGames.find((g) => g.id === fastest.gameId);
          fastestWin = {
            gameId: fastest.gameId,
            moveCount: Number(fastest.moveCount),
            finishedAt: gameInfo?.finishedAt?.toISOString() ?? "",
          };
        }
      }

      const finishedGameIds = userGames.map((g) => g.id);
      let longestGame = null;
      if (finishedGameIds.length > 0) {
        const [longest] = await db
          .select({ gameId: moves.gameId, moveCount: sql<number>`count(*)` })
          .from(moves)
          .where(inArray(moves.gameId, finishedGameIds))
          .groupBy(moves.gameId)
          .orderBy(desc(sql`count(*)`))
          .limit(1);
        if (longest) {
          const gameInfo = userGames.find((g) => g.id === longest.gameId);
          longestGame = {
            gameId: longest.gameId,
            moveCount: Number(longest.moveCount),
            finishedAt: gameInfo?.finishedAt?.toISOString() ?? "",
          };
        }
      }

      const milestones = {
        fastestWin,
        longestGame,
        highestRating: user.gamesPlayed > 0 ? { rating: user.peakRating } : null,
        totalSecondsPlayed,
      };

      return reply.send({
        totalGames: userGames.length,
        streaks: { current: currentStreak, longest: longestStreak },
        form,
        byTimeControl,
        byOpponentStrength,
        milestones,
      });
    }
  );

  app.get<{ Params: { id: string } }>("/users/:id/opponents", async (request, reply) => {
    const id = Number(request.params.id);
    if (isNaN(id)) return reply.code(400).send({ error: "Invalid id" });

    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, id));
    if (!user) return reply.code(404).send({ error: "User not found" });

    const opponentIdExpr = sql<number>`CASE WHEN ${games.player1Id} = ${id} THEN ${games.player2Id} ELSE ${games.player1Id} END`;

    const rows = await db
      .select({
        opponentId: opponentIdExpr,
        gamesAgainst: sql<number>`count(*)::int`,
      })
      .from(games)
      .where(
        and(
          or(eq(games.player1Id, id), eq(games.player2Id, id)),
          eq(games.isAiOpponent, false),
          inArray(games.status, ["finished", "abandoned"]),
        ),
      )
      .groupBy(sql`1`)
      .orderBy(sql`count(*) desc`)
      .limit(3);

    const map = await loadPublicUsers(rows.map((r) => r.opponentId));
    const opponents = rows.map((r) => {
      const u = map.get(r.opponentId) ?? { id: r.opponentId, username: "Joueur supprimé", avatarUrl: null };
      return { ...u, gamesAgainst: r.gamesAgainst };
    });

    return reply.send({ opponents });
  });
}

async function loadPublicUsers(
  ids: number[],
): Promise<Map<number, { id: number; username: string; avatarUrl: string | null }>> {
  const map = new Map<number, { id: number; username: string; avatarUrl: string | null }>();
  if (ids.length === 0) return map;

  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      avatarUrl: users.avatarUrl,
      isDeleted: users.isDeleted,
    })
    .from(users)
    .where(inArray(users.id, ids));

  for (const u of rows) {
    map.set(
      u.id,
      u.isDeleted
        ? { id: u.id, username: "Joueur supprimé", avatarUrl: null }
        : { id: u.id, username: u.username, avatarUrl: u.avatarUrl },
    );
  }
  return map;
}
