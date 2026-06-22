// Script de seed : insère des données de test dans la base.
// À lancer avec : pnpm db:seed
// Le but : avoir des users, des parties, des amitiés, des notifs pour tester
// l'API sans avoir à créer manuellement chaque ligne en SQL.

import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client.js";
import {
  users,
  friendships,
  blockedUsers,
  games,
  moves,
  lobbies,
  chatMessages,
  notifications,
} from "../src/db/schema.js";

// 9 high-rated users with explicit Elo ratings matching the wireframe in
// apps/web/src/components/landing/Leaderboard.tsx (QuantumDrop 2854,
// Sarah_w 2710, ...). gamesPlayed/Won/Lost/Drawn are self-consistent and
// produce a win rate that loosely tracks rating (higher Elo → higher
// win rate). The top-6 of these will populate the /api/leaderboard
// response. The 4 baseline users (alice/bob/charlie/diana) keep their
// 1000 default; they exist for the chat/friends/block tests.
const HIGH_RATED_USERS = [
  { username: "QuantumDrop",  email: "qd@42.fr",  rating: 2854, peakRating: 2912, gamesPlayed: 250, gamesWon: 235, gamesLost: 8,  gamesDrawn: 7 },
  { username: "Sarah_w",      email: "sw@42.fr",  rating: 2710, peakRating: 2745, gamesPlayed: 200, gamesWon: 183, gamesLost: 12, gamesDrawn: 5 },
  { username: "BotSlayer99",  email: "bs@42.fr",  rating: 2699, peakRating: 2720, gamesPlayed: 200, gamesWon: 178, gamesLost: 17, gamesDrawn: 5 },
  { username: "GridLock_",    email: "gl@42.fr",  rating: 2569, peakRating: 2601, gamesPlayed: 200, gamesWon: 170, gamesLost: 22, gamesDrawn: 8 },
  { username: "A_connect",    email: "ac@42.fr",  rating: 2349, peakRating: 2380, gamesPlayed: 150, gamesWon: 123, gamesLost: 22, gamesDrawn: 5 },
  { username: "Pivot_",       email: "pv@42.fr",  rating: 2210, peakRating: 2240, gamesPlayed: 100, gamesWon: 73,  gamesLost: 22, gamesDrawn: 5 },
  { username: "FourFingers",  email: "ff@42.fr",  rating: 2080, peakRating: 2110, gamesPlayed: 80,  gamesWon: 56,  gamesLost: 19, gamesDrawn: 5 },
  { username: "DiagonalDan",  email: "dd@42.fr",  rating: 1980, peakRating: 2010, gamesPlayed: 70,  gamesWon: 47,  gamesLost: 19, gamesDrawn: 4 },
  { username: "RookieRed",    email: "rr@42.fr",  rating: 1654, peakRating: 1680, gamesPlayed: 30,  gamesWon: 15,  gamesLost: 13, gamesDrawn: 2 },
];

async function seed() {
  console.log("🌱 Seeding database...");

  // 1. On vide les tables. Comme ça on peut relancer le seed plusieurs fois
  //    sans erreur de doublon (email/username unique).
  //    Ordre important : on supprime d'abord les tables qui référencent
  //    les autres (FK), sinon PG râle.
  console.log("Clearing tables...");
  await db.delete(notifications);
  await db.delete(chatMessages);
  await db.delete(moves);
  await db.delete(games);
  await db.delete(lobbies);
  await db.delete(blockedUsers);
  await db.delete(friendships);
  await db.delete(users);

  // 2. Crée 4 users avec un mot de passe hashé.
  //    Tous ont le même mot de passe ("password123") pour faciliter les tests.
  //    bcrypt.hash(plain, 12) : 12 = nombre de rounds (plus = plus sûr mais plus lent)
  console.log("Creating users...");
  const password = await bcrypt.hash("password123", 12);

  // Baseline users — kept stable for chat/friends/block tests.
  // Alice won her single game (1000 → 1016), bob lost his (1000 → 984).
  const insertedUsers = await db
    .insert(users)
    .values([
      { email: "alice@42.fr",   username: "alice",   password, bio: "I love Connect 4", rating: 1016, peakRating: 1016 },
      { email: "bob@42.fr",     username: "bob",     password, bio: "Bob the builder",  rating: 984,  peakRating: 1000 },
      { email: "charlie@42.fr", username: "charlie", password, status: "online",         rating: 1000, peakRating: 1000 },
      { email: "diana@42.fr",   username: "diana",   password, status: "in_game",        rating: 1000, peakRating: 1000 },
    ])
    .returning();

  const [alice, bob, charlie, diana] = insertedUsers;

  // High-rated leaderboard users — explicit Elo values, self-consistent
  // gamesPlayed/Won/Lost/Drawn. Inserted after the baseline so the
  // baseline's chat/friends rows reference their stable IDs (1-4).
  const insertedHigh = await db
    .insert(users)
    .values(
      HIGH_RATED_USERS.map((u) => ({
        email: u.email,
        username: u.username,
        password,
        rating: u.rating,
        peakRating: u.peakRating,
        gamesPlayed: u.gamesPlayed,
        gamesWon: u.gamesWon,
        gamesLost: u.gamesLost,
        gamesDrawn: u.gamesDrawn,
      })),
    )
    .returning();

  const highByName = Object.fromEntries(insertedHigh.map((u) => [u.username, u]));

  // 3. Crée des amitiés.
  //    alice <-> bob : amis
  //    alice <-> charlie : amis
  //    bob -> diana : demande envoyée, en attente
  console.log("Creating friendships...");
  await db.insert(friendships).values([
    { userId: alice.id, friendId: bob.id,     status: "accepted" },
    { userId: alice.id, friendId: charlie.id, status: "accepted" },
    { userId: bob.id,   friendId: diana.id,   status: "pending" },
  ]);

  // 4. charlie a bloqué diana
  console.log("Creating block...");
  await db.insert(blockedUsers).values([
    { userId: charlie.id, blockedUserId: diana.id },
  ]);

  // 5. Crée une partie déjà finie : alice (J1) vs bob (J2), alice gagne.
  //    .returning() pour récupérer l'ID de la partie créée (utile pour les moves).
  console.log("Creating finished game...");
  const [game1] = await db
    .insert(games)
    .values([
      {
        player1Id: alice.id,
        player2Id: bob.id,
        winnerId: alice.id,
        status: "finished",
        mode: "connect4",
        timePerPlayerSeconds: 300,
        startedAt: new Date(Date.now() - 3600 * 1000), // il y a 1h
        finishedAt: new Date(),
      },
    ])
    .returning();

  // 6. Crée 4 coups pour cette partie (alice et bob jouent à tour de rôle).
  console.log("Creating moves...");
  await db.insert(moves).values([
    { gameId: game1.id, playerId: alice.id, column: 3, row: 0, moveNumber: 1 },
    { gameId: game1.id, playerId: bob.id,   column: 4, row: 0, moveNumber: 2 },
    { gameId: game1.id, playerId: alice.id, column: 3, row: 1, moveNumber: 3 },
    { gameId: game1.id, playerId: bob.id,   column: 4, row: 1, moveNumber: 4 },
  ]);

  // 6b. Quelques parties historiques entre les joueurs haut-classés.
  //     Le but : donner du vécu à la page de profil / leaderboard sans
  //     recalculer les Elo (les rating sont fixés explicitement plus haut
  //     pour correspondre à la maquette). Les résultats sont choisis
  //     pour que les perdants aient quand même des `gamesLost` non nuls
  //     (cohérent avec les stats du seed ci-dessus).
  console.log("Creating historical games...");
  const historicalGames = [
    // QuantumDrop dominates the upper bracket
    { p1: "QuantumDrop", p2: "Sarah_w",     winner: "QuantumDrop" },
    { p1: "QuantumDrop", p2: "BotSlayer99", winner: "QuantumDrop" },
    { p1: "QuantumDrop", p2: "GridLock_",   winner: "QuantumDrop" },
    { p1: "QuantumDrop", p2: "A_connect",   winner: "QuantumDrop" },
    // Some upend / draws
    { p1: "Sarah_w",     p2: "BotSlayer99", winner: "Sarah_w" },
    { p1: "Sarah_w",     p2: "GridLock_",   winner: "Sarah_w" },
    { p1: "BotSlayer99", p2: "GridLock_",   winner: "BotSlayer99" },
    { p1: "BotSlayer99", p2: "A_connect",   winner: "BotSlayer99" },
    { p1: "GridLock_",   p2: "A_connect",   winner: "A_connect" },
    // Mid bracket
    { p1: "A_connect",   p2: "Pivot_",      winner: "A_connect" },
    { p1: "A_connect",   p2: "FourFingers", winner: "A_connect" },
    { p1: "Pivot_",      p2: "FourFingers", winner: "Pivot_" },
    { p1: "Pivot_",      p2: "DiagonalDan", winner: "Pivot_" },
    { p1: "FourFingers", p2: "DiagonalDan", winner: "FourFingers" },
    // Lower bracket — RookieRed takes some losses
    { p1: "DiagonalDan", p2: "RookieRed",   winner: "DiagonalDan" },
    { p1: "RookieRed",   p2: "FourFingers", winner: "FourFingers" },
    { p1: "RookieRed",   p2: "Pivot_",      winner: "Pivot_" },
    { p1: "RookieRed",   p2: "DiagonalDan", winner: "DiagonalDan" },
    // Cross-bracket upsets
    { p1: "RookieRed",   p2: "A_connect",   winner: "A_connect" },
    { p1: "DiagonalDan", p2: "GridLock_",   winner: "DiagonalDan" },
    // A few draws to bump gamesDrawn counts
    { p1: "Sarah_w",     p2: "BotSlayer99", winner: null },
    { p1: "Pivot_",      p2: "FourFingers", winner: null },
    { p1: "RookieRed",   p2: "DiagonalDan", winner: null },
  ];

  for (const h of historicalGames) {
    const p1 = highByName[h.p1];
    const p2 = highByName[h.p2];
    if (!p1 || !p2) continue;
    const [g] = await db
      .insert(games)
      .values({
        player1Id: p1.id,
        player2Id: p2.id,
        winnerId: h.winner ? highByName[h.winner].id : null,
        status: "finished",
        mode: "connect4",
        timePerPlayerSeconds: 300,
        startedAt: new Date(Date.now() - Math.floor(Math.random() * 30) * 24 * 3600 * 1000),
        finishedAt: new Date(),
      })
      .returning();
    // 4 cosmetic moves — they don't need to be a real game.
    await db.insert(moves).values([
      { gameId: g.id, playerId: p1.id, column: 0, row: 5, moveNumber: 1 },
      { gameId: g.id, playerId: p2.id, column: 1, row: 5, moveNumber: 2 },
      { gameId: g.id, playerId: p1.id, column: 0, row: 4, moveNumber: 3 },
      { gameId: g.id, playerId: p2.id, column: 1, row: 4, moveNumber: 4 },
    ]);
  }

  // 7. Crée une partie en cours : charlie vs IA (medium).
  //    player2Id reste null, isAiOpponent = true.
  console.log("Creating AI game...");
  await db.insert(games).values([
    {
      player1Id: charlie.id,
      isAiOpponent: true,
      aiDifficulty: "medium",
      status: "in_progress",
      mode: "connect4",
      timePerPlayerSeconds: 600,
      startedAt: new Date(),
    },
  ]);

  // 8. Met à jour les stats : alice a gagné sa partie, bob l'a perdue.
  //    .update().set().where() = équivalent SQL UPDATE ... SET ... WHERE
  console.log("Updating baseline user stats...");
  await db.update(users).set({ gamesPlayed: 1, gamesWon: 1 }).where(eq(users.id, alice.id));
  await db.update(users).set({ gamesPlayed: 1, gamesLost: 1 }).where(eq(users.id, bob.id));
  await db.update(users).set({ gamesPlayed: 1 }).where(eq(users.id, charlie.id));

  // 9. Crée un lobby ouvert : diana attend un joueur, code "ABC123".
  console.log("Creating lobby...");
  await db.insert(lobbies).values([
    {
      code: "ABC123",
      creatorId: diana.id,
      isPublic: true,
      mode: "connect4",
      timePerPlayerSeconds: 300,
      status: "waiting",
    },
  ]);

  // 10. Quelques messages entre alice et bob après leur partie.
  console.log("Creating chat messages...");
  await db.insert(chatMessages).values([
    { senderId: alice.id, receiverId: bob.id,   content: "GG !" },
    { senderId: bob.id,   receiverId: alice.id, content: "Bien joué" },
  ]);

  // 11. Notifications : diana a une demande d'ami non lue, bob a une notif lue.
  //     content est en JSON (jsonb) : structure libre selon le type de notif.
  console.log("Creating notifications...");
  await db.insert(notifications).values([
    {
      userId: diana.id,
      type: "friend_request",
      content: { from: { id: bob.id, username: "bob" } },
      read: false,
    },
    {
      userId: bob.id,
      type: "game_finished",
      content: { gameId: game1.id, result: "lost", opponent: "alice" },
      read: true,
    },
  ]);

  console.log("✅ Seed done!");
}

// Exécute le seed et gère les erreurs proprement.
// process.exit(0) à la fin pour fermer la connexion PG (sinon le script reste bloqué).
seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  });
