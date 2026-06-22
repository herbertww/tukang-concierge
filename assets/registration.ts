/**
 * Self-registration procedures for handymen, beauticians, and facialists.
 * Public: submitRegistration
 * Admin-only: listRegistrations, approveRegistration, rejectRegistration
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { handymen, reviews } from "../../drizzle/schema";
import { eq, desc, and } from "drizzle-orm";
import { notifyOwner } from "../_core/notification";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function adminOnly(ctx: { user: { role: string } }) {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const registrationRouter = router({
  /**
   * Public: anyone can submit a registration application.
   * Status defaults to "pending" — admin must approve before they appear in search.
   */
  submit: publicProcedure
    .input(
      z.object({
        // Identity
        name: z.string().min(2).max(128),
        phone: z.string().min(8).max(32),
        whatsappPhone: z.string().min(8).max(32).optional(),
        email: z.string().email().optional(),
        instagramHandle: z.string().max(128).optional(),
        portfolioUrl: z.string().url().optional(),
        // Category
        serviceCategory: z.enum(["handyman", "beautician", "facialist"]),
        // Services offered (JSON array)
        services: z.array(z.string()).min(1),
        // Areas covered (JSON array of district names)
        areas: z.array(z.string()).min(1),
        // Rates
        rateMin: z.number().min(0),
        rateMax: z.number().min(0),
        currency: z.string().default("SGD"),
        // Profile
        bio: z.string().max(1000).optional(),
        yearsExperience: z.number().min(0).max(60).default(1),
        acraRegistered: z.boolean().default(false),
        acraNumber: z.string().max(32).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Check for duplicate phone
      const existing = await db
        .select({ id: handymen.id })
        .from(handymen)
        .where(eq(handymen.phone, input.phone))
        .limit(1);

      if (existing.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A provider with this phone number is already registered.",
        });
      }

      const [result] = await db.insert(handymen).values({
        name: input.name,
        phone: input.phone,
        whatsappPhone: input.whatsappPhone ?? input.phone,
        email: input.email,
        instagramHandle: input.instagramHandle,
        portfolioUrl: input.portfolioUrl,
        serviceCategory: input.serviceCategory,
        services: JSON.stringify(input.services),
        areas: JSON.stringify(input.areas),
        rateMin: String(input.rateMin),
        rateMax: String(input.rateMax),
        currency: input.currency,
        bio: input.bio,
        yearsExperience: input.yearsExperience,
        acraRegistered: input.acraRegistered,
        acraNumber: input.acraNumber,
        available: false, // not available until approved
        registrationStatus: "pending",
        rating: "5.00",
        reviewCount: 0,
      });

      // Notify owner
      await notifyOwner({
        title: `New ${input.serviceCategory} registration: ${input.name}`,
        content: `${input.name} (${input.phone}) applied to join Tukang as a ${input.serviceCategory}. Review at /admin/providers.`,
      });

      return { success: true, message: "Application submitted! We'll review and contact you within 1–2 business days." };
    }),

  /**
   * Admin: list all registrations, optionally filtered by status or category.
   */
  list: protectedProcedure
    .input(
      z.object({
        status: z.enum(["pending", "approved", "rejected", "all"]).default("pending"),
        category: z.enum(["handyman", "beautician", "facialist", "all"]).default("all"),
      })
    )
    .query(async ({ ctx, input }) => {
      adminOnly(ctx);
      const db = await getDb();
      if (!db) return [];

      let rows = await db
        .select()
        .from(handymen)
        .orderBy(desc(handymen.createdAt));

      if (input.status !== "all") {
        rows = rows.filter((r) => r.registrationStatus === input.status);
      }
      if (input.category !== "all") {
        rows = rows.filter((r) => r.serviceCategory === input.category);
      }

      // Attach review summaries
      const allReviews = await db.select().from(reviews);
      return rows.map((h) => {
        const handymanReviews = allReviews.filter((r) => r.handymanId === h.id);
        return {
          ...h,
          services: (() => { try { return JSON.parse(h.services); } catch { return []; } })(),
          areas: (() => { try { return JSON.parse(h.areas); } catch { return []; } })(),
          recentReviews: handymanReviews.slice(0, 3),
        };
      });
    }),

  /**
   * Admin: approve a pending registration.
   */
  approve: protectedProcedure
    .input(z.object({ id: z.number(), notes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      adminOnly(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db
        .update(handymen)
        .set({ registrationStatus: "approved", available: true, registrationNotes: input.notes ?? null })
        .where(eq(handymen.id, input.id));

      return { success: true };
    }),

  /**
   * Admin: reject a registration with optional notes.
   */
  reject: protectedProcedure
    .input(z.object({ id: z.number(), notes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      adminOnly(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db
        .update(handymen)
        .set({ registrationStatus: "rejected", available: false, registrationNotes: input.notes ?? null })
        .where(eq(handymen.id, input.id));

      return { success: true };
    }),

  /**
   * Public: get stats for the landing page (approved provider counts by category).
   */
  stats: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { handyman: 0, beautician: 0, facialist: 0, total: 0 };

    const approved = await db
      .select()
      .from(handymen)
      .where(eq(handymen.registrationStatus, "approved"));

    const counts = { handyman: 0, beautician: 0, facialist: 0 };
    for (const h of approved) {
      counts[h.serviceCategory as keyof typeof counts]++;
    }
    return { ...counts, total: approved.length };
  }),
});
