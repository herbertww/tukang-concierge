import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  boolean,
  json,
} from "drizzle-orm/mysql-core";

// ─── Core Auth ───────────────────────────────────────────────────────────────

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Handymen ─────────────────────────────────────────────────────────────────

export const handymen = mysqlTable("handymen", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  phone: varchar("phone", { length: 32 }).notNull(),
  whatsappPhone: varchar("whatsappPhone", { length: 32 }),
  services: text("services").notNull(), // JSON array of service slugs
  areas: text("areas").notNull(),       // JSON array of district names
  rateMin: decimal("rateMin", { precision: 8, scale: 2 }).notNull(),
  rateMax: decimal("rateMax", { precision: 8, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 8 }).default("SGD").notNull(),
  rating: decimal("rating", { precision: 3, scale: 2 }).default("5.00").notNull(),
  reviewCount: int("reviewCount").default(0).notNull(),
  acraRegistered: boolean("acraRegistered").default(false).notNull(),
  acraNumber: varchar("acraNumber", { length: 32 }),
  bio: text("bio"),
  yearsExperience: int("yearsExperience").default(1).notNull(),
  available: boolean("available").default(true).notNull(),
  avatarUrl: text("avatarUrl"),
  // Self-registration fields
  serviceCategory: mysqlEnum("serviceCategory", ["handyman", "beautician", "facialist"]).default("handyman").notNull(),
  registrationStatus: mysqlEnum("registrationStatus", ["pending", "approved", "rejected"]).default("approved").notNull(),
  registrationNotes: text("registrationNotes"), // admin notes on approval/rejection
  email: varchar("email", { length: 320 }),
  instagramHandle: varchar("instagramHandle", { length: 128 }),
  portfolioUrl: text("portfolioUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Handyman = typeof handymen.$inferSelect;

// ─── Reviews ──────────────────────────────────────────────────────────────────

export const reviews = mysqlTable("reviews", {
  id: int("id").autoincrement().primaryKey(),
  handymanId: int("handymanId").notNull(),
  rating: int("rating").notNull(), // 1–5
  comment: text("comment"),
  reviewerName: varchar("reviewerName", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Bookings ─────────────────────────────────────────────────────────────────

export const bookings = mysqlTable("bookings", {
  id: int("id").autoincrement().primaryKey(),
  userId: varchar("userId", { length: 128 }).notNull(), // Mem0 user_id or session id
  handymanId: int("handymanId").notNull(),
  serviceType: varchar("serviceType", { length: 128 }).notNull(),
  scheduledDate: varchar("scheduledDate", { length: 64 }),
  scheduledTime: varchar("scheduledTime", { length: 64 }),
  address: text("address"),
  agreedPrice: decimal("agreedPrice", { precision: 8, scale: 2 }),
  notes: text("notes"),
  status: mysqlEnum("status", [
    "pending",
    "confirmed",
    "in_progress",
    "completed",
    "cancelled",
  ]).default("pending").notNull(),
  stripeFeeSessionId: varchar("stripeFeeSessionId", { length: 256 }),
  stripeFeeStatus: mysqlEnum("stripeFeeStatus", [
    "unpaid",
    "paid",
    "refunded",
  ]).default("unpaid").notNull(),
  stripeFeeUrl: text("stripeFeeUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Booking = typeof bookings.$inferSelect;

// ─── Call Results (Vapi) ──────────────────────────────────────────────────────

export const callResults = mysqlTable("call_results", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: varchar("sessionId", { length: 128 }).notNull(), // groups parallel calls
  handymanId: int("handymanId").notNull(),
  handymanName: varchar("handymanName", { length: 128 }),
  callStatus: mysqlEnum("callStatus", [
    "pending",
    "completed",
    "no_answer",
    "busy",
    "failed",
    "simulated",
  ]).default("pending").notNull(),
  available: boolean("available"),
  quotedPrice: decimal("quotedPrice", { precision: 8, scale: 2 }),
  availableDate: varchar("availableDate", { length: 64 }),
  availableTime: varchar("availableTime", { length: 64 }),
  transcript: text("transcript"),
  vapiCallId: varchar("vapiCallId", { length: 128 }),
  responseTimeSec: int("responseTimeSec"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CallResult = typeof callResults.$inferSelect;

// ─── Handyman Quotes (inbound WhatsApp replies) ──────────────────────────────

export const handymanQuotes = mysqlTable("handyman_quotes", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: varchar("sessionId", { length: 128 }).notNull(),
  handymanId: int("handymanId").notNull(),
  handymanName: varchar("handymanName", { length: 128 }),
  fromPhone: varchar("fromPhone", { length: 32 }).notNull(),
  rawMessage: text("rawMessage").notNull(),
  quotedPrice: decimal("quotedPrice", { precision: 8, scale: 2 }),
  availableDate: varchar("availableDate", { length: 128 }),
  availableTime: varchar("availableTime", { length: 64 }),
  status: mysqlEnum("status", ["pending", "replied", "accepted", "rejected"]).default("replied").notNull(),
  waMessageId: varchar("waMessageId", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type HandymanQuote = typeof handymanQuotes.$inferSelect;

// ─── WhatsApp Messages ────────────────────────────────────────────────────────

export const whatsappMessages = mysqlTable("whatsapp_messages", {
  id: int("id").autoincrement().primaryKey(),
  toPhone: varchar("toPhone", { length: 32 }).notNull(),
  messageType: varchar("messageType", { length: 64 }).notNull(),
  body: text("body").notNull(),
  waMessageId: varchar("waMessageId", { length: 128 }),
  status: mysqlEnum("status", ["sent", "failed", "simulated"]).default("sent").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
