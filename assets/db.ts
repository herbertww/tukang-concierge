import { eq, and, like, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, handymen, reviews, bookings, callResults, whatsappMessages, handymanQuotes } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    const value = user[field];
    if (value === undefined) continue;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  }
  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
  else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Handymen ─────────────────────────────────────────────────────────────────

export async function searchHandymen(opts: {
  service?: string;
  area?: string;
  maxRate?: number;
  minRating?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  let query = db.select().from(handymen).where(eq(handymen.available, true));
  const results = await query;
  return results.filter((h) => {
    const services: string[] = JSON.parse(h.services);
    const areas: string[] = JSON.parse(h.areas);
    if (opts.service && !services.some((s) => s.toLowerCase().includes(opts.service!.toLowerCase()))) return false;
    if (opts.area && !areas.some((a) => a.toLowerCase().includes(opts.area!.toLowerCase()))) return false;
    if (opts.maxRate && Number(h.rateMin) > opts.maxRate) return false;
    if (opts.minRating && Number(h.rating) < opts.minRating) return false;
    return true;
  });
}

export async function getHandymanById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(handymen).where(eq(handymen.id, id)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getHandymanReviews(handymanId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(reviews).where(eq(reviews.handymanId, handymanId)).limit(10);
}

export async function getAllHandymen() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(handymen).where(eq(handymen.available, true));
}

// ─── Bookings ─────────────────────────────────────────────────────────────────

export async function createBooking(data: {
  userId: string;
  handymanId: number;
  serviceType: string;
  scheduledDate?: string;
  scheduledTime?: string;
  address?: string;
  agreedPrice?: number;
  notes?: string;
  stripeFeeUrl?: string;
  stripeFeeSessionId?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(bookings).values({
    userId: data.userId,
    handymanId: data.handymanId,
    serviceType: data.serviceType,
    scheduledDate: data.scheduledDate,
    scheduledTime: data.scheduledTime,
    address: data.address,
    agreedPrice: data.agreedPrice ? String(data.agreedPrice) : undefined,
    notes: data.notes,
    status: "pending",
    stripeFeeSessionId: data.stripeFeeSessionId,
    stripeFeeStatus: "unpaid",
    stripeFeeUrl: data.stripeFeeUrl,
  });
  return result;
}

export async function updateBookingStripeStatus(sessionId: string, status: "paid" | "refunded") {
  const db = await getDb();
  if (!db) return;
  await db
    .update(bookings)
    .set({ stripeFeeStatus: status, status: status === "paid" ? "confirmed" : "pending" })
    .where(eq(bookings.stripeFeeSessionId, sessionId));
}

export async function getBookingByStripeSession(sessionId: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(bookings).where(eq(bookings.stripeFeeSessionId, sessionId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

// ─── Call Results ─────────────────────────────────────────────────────────────

export async function saveCallResult(data: {
  sessionId: string;
  handymanId: number;
  handymanName: string;
  callStatus: "completed" | "no_answer" | "busy" | "failed" | "simulated";
  available?: boolean;
  quotedPrice?: number;
  availableDate?: string;
  availableTime?: string;
  transcript?: string;
  vapiCallId?: string;
  responseTimeSec?: number;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(callResults).values({
    sessionId: data.sessionId,
    handymanId: data.handymanId,
    handymanName: data.handymanName,
    callStatus: data.callStatus,
    available: data.available,
    quotedPrice: data.quotedPrice ? String(data.quotedPrice) : undefined,
    availableDate: data.availableDate,
    availableTime: data.availableTime,
    transcript: data.transcript,
    vapiCallId: data.vapiCallId,
    responseTimeSec: data.responseTimeSec,
  });
}

export async function getCallResultsBySession(sessionId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(callResults).where(eq(callResults.sessionId, sessionId));
}

// ─── Handyman Quotes (inbound replies) ───────────────────────────────────────────────────────

/**
 * Save an inbound quote reply from a handyman.
 * Called by the WhatsApp webhook when a handyman replies with their price.
 */
export async function saveHandymanQuote(data: {
  sessionId: string;
  handymanId: number;
  handymanName?: string;
  fromPhone: string;
  rawMessage: string;
  quotedPrice?: number;
  availableDate?: string;
  availableTime?: string;
  waMessageId?: string;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(handymanQuotes).values({
    sessionId: data.sessionId,
    handymanId: data.handymanId,
    handymanName: data.handymanName,
    fromPhone: data.fromPhone,
    rawMessage: data.rawMessage,
    quotedPrice: data.quotedPrice ? String(data.quotedPrice) : undefined,
    availableDate: data.availableDate,
    availableTime: data.availableTime,
    waMessageId: data.waMessageId,
    status: "replied",
  });
}

/**
 * Get all inbound quotes for a session.
 */
export async function getQuotesBySession(sessionId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(handymanQuotes).where(eq(handymanQuotes.sessionId, sessionId));
}

/**
 * Look up which session a handyman phone belongs to (for webhook routing).
 * Finds the most recent pending call_result for this handyman phone.
 */
export async function getSessionForPhone(fromPhone: string) {
  const db = await getDb();
  if (!db) return null;
  // Find handyman by phone
  const allHandymen = await db.select().from(handymen);
  const match = allHandymen.find(
    (h) => (h.whatsappPhone ?? h.phone) === fromPhone ||
            h.phone === fromPhone ||
            h.whatsappPhone === fromPhone
  );
  if (!match) return null;
  // Find most recent session for this handyman
  const results = await db
    .select()
    .from(callResults)
    .where(eq(callResults.handymanId, match.id))
    .orderBy(sql`${callResults.createdAt} DESC`)
    .limit(1);
  return results.length > 0 ? { sessionId: results[0]!.sessionId, handyman: match } : null;
}

// ─── WhatsApp Messages ────────────────────────────────────────────────────────

export async function logWhatsAppMessage(data: {
  toPhone: string;
  messageType: string;
  body: string;
  waMessageId?: string;
  status: "sent" | "failed" | "simulated";
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(whatsappMessages).values(data);
}
