import {
  pgTable,
  serial,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";


// Enum pour le statut utilisateur
export const userStatusEnum = pgEnum("user_status", [
  "online",
  "offline",
  "in_game",
]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  password: text("password"), // nullable pour les comptes OAuth-only
  username: text("username").notNull().unique(),
  avatarUrl: text("avatar_url"),
  bio: text("bio"),
  status: userStatusEnum("status").notNull().default("offline"),
  isDeleted: boolean("is_deleted").notNull().default(false),
  oauth42Id: text("oauth_42_id").unique(),
  pawnSkin: text("pawn_skin").notNull().default("default"),
  gridSkin: text("grid_skin").notNull().default("liquid-glass"),
  gamesPlayed: integer("games_played").notNull().default(0),
  gamesWon: integer("games_won").notNull().default(0),
  gamesLost: integer("games_lost").notNull().default(0),
  gamesDrawn: integer("games_drawn").notNull().default(0),
  rating: integer("rating").notNull().default(1000),
  peakRating: integer("peak_rating").notNull().default(1000),
  // Set the first time the user reaches step 4 of /signup. Once set, the
  // signup-page gate redirects /signup → / for this user — they can't
  // re-enter the flow and accidentally overwrite their profile with the
  // form's defaults. Future profile edits go through /settings (TBD).
  signupCompletedAt: timestamp("signup_completed_at"),
  // Set whenever the user changes their password via /api/profile/password.
  // Stays null for OAuth-only accounts that have never set a password.
  // Surfaced in GET /api/profile as `passwordChangedAt` (ISO 8601) and
  // displayed in /settings under the Password row as "Last changed · …".
  passwordChangedAt: timestamp("password_changed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Enum pour le statut d'une demande d'ami
export const friendshipStatusEnum = pgEnum("friendship_status", [
  "pending",
  "accepted",
]);


// Format : userId, friendId, status (pending/accepted), createdAt
export const friendships = pgTable("friendships", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  friendId: integer("friend_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: friendshipStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Format : userId, blockedUserId, createdAt
export const blockedUsers = pgTable("blocked_users", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  blockedUserId: integer("blocked_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Enums pour les parties
export const aiDifficultyEnum = pgEnum("ai_difficulty", [
  "easy",
  "medium",
  "hard",
]);

export const gameStatusEnum = pgEnum("game_status", [
  "waiting",
  "in_progress",
  "finished",
  "abandoned",
]);

export const gameModeEnum = pgEnum("game_mode", ["connect4", "connect5"]);

// Format : id, player1Id, player2Id (null si IA), isAiOpponent, aiDifficulty (null si vs humain), winnerId (null si nul ou en cours), status, mode, timePerPlayerSeconds, startedAt, finishedAt
export const games = pgTable("games", {
  id: serial("id").primaryKey(),
  player1Id: integer("player1_id")
    .notNull()
    .references(() => users.id),
  player2Id: integer("player2_id").references(() => users.id), // null si IA
  isAiOpponent: boolean("is_ai_opponent").notNull().default(false),
  aiDifficulty: aiDifficultyEnum("ai_difficulty"), // null si vs humain
  winnerId: integer("winner_id").references(() => users.id), // null si nul ou en cours
  status: gameStatusEnum("status").notNull().default("waiting"),
  mode: gameModeEnum("mode").notNull().default("connect4"),
  timePerPlayerSeconds: integer("time_per_player_seconds").notNull().default(300),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  lastAiTelemetry: jsonb("last_ai_telemetry"),
  lastAiMove: jsonb("last_ai_move"),
});


// Format : id, gameId, playerId (null si coup IA), column, row, moveNumber, playedAt
export const moves = pgTable("moves", {
  id: serial("id").primaryKey(),
  gameId: integer("game_id")
    .notNull()
    .references(() => games.id, { onDelete: "cascade" }),
  playerId: integer("player_id").references(() => users.id), // null si coup IA
  column: integer("column").notNull(),
  row: integer("row").notNull(),
  moveNumber: integer("move_number").notNull(),
  playedAt: timestamp("played_at").notNull().defaultNow(),
});

// Enum pour le statut d'un lobby
export const lobbyStatusEnum = pgEnum("lobby_status", [
  "waiting",
  "in_progress",
  "closed",
]);

// Format : id, code, creatorId, player2Id, isPublic, mode, timePerPlayerSeconds, status, createdAt
export const lobbies = pgTable("lobbies", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(), // 6 caractères, généré à la création
  creatorId: integer("creator_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  player2Id: integer("player2_id").references(() => users.id, { onDelete: "set null" }),
  isPublic: boolean("is_public").notNull().default(true),
  mode: gameModeEnum("mode").notNull().default("connect4"),
  timePerPlayerSeconds: integer("time_per_player_seconds").notNull().default(300),
  status: lobbyStatusEnum("status").notNull().default("waiting"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});


// Format : id, lobbyId, userId, joinedAt
export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  senderId: integer("sender_id")
    .notNull()
    .references(() => users.id),
  receiverId: integer("receiver_id")
    .notNull()
    .references(() => users.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Enum pour le type de notification
export const notificationTypeEnum = pgEnum("notification_type", [
  "friend_request",
  "friend_accepted",
  "game_invite",
  "game_finished",
  "chat_message",
]);

// Format : id, userId, type, content (json), read, createdAt
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: notificationTypeEnum("type").notNull(),
  content: jsonb("content").notNull(), // payload variable selon le type
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

