/**
 * FILE: app/api/reviews/route.js
 * ROLE: Public — no auth required, called by the "Create Review" modal
 *       on the visitor Guest Reviews section
 *
 * PURPOSE:
 * Creates a Testimonial row from a visitor-submitted guest review
 * (name, 1-5 star rating, message, optional photo). Every submission
 * is inserted with isApproved: false and isFeatured: false — it never
 * appears anywhere on the public site until a super-admin reviews and
 * approves it under Super-Admin > Testimonials, same moderation gate
 * pattern this template already uses for walk-in inquiries turning
 * into confirmed leads.
 *
 * DATA FLOW:
 * 1. CreateReviewModal.jsx POSTs multipart/form-data:
 *    guestName, rating, quote, optional photo file
 * 2. Rate limited to 10 submissions per 15 minutes per IP (Rule 32.1,
 *    same tier as the walk-in inquiry / booking form endpoints)
 * 3. Zod validates the text fields; scanForSqlInjection() flags known
 *    attack patterns as defense-in-depth visibility (Rule 39)
 * 4. If a photo was attached, it's resized/compressed/converted to
 *    WebP and uploaded to Cloudflare R2 under testimonials/ — same
 *    pipeline the super-admin upload endpoint uses
 * 5. Inserts the Testimonial row (source: "visitor", isApproved: false)
 *    and logs a "review_submitted" VisitorLog entry so it also shows
 *    up in Visitor Logs with geo, same as booking_submitted
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/services/prisma";
import { checkRateLimit } from "@/services/rateLimit";
import { logSecurityEvent } from "@/services/securityLog";
import { logVisitorActivity } from "@/services/visitorLog";
import { scanForSqlInjection } from "@/services/sqlInjectionGuard";
import { processImage } from "@/utils/imageProcessor";
import { uploadToR2, deleteFromR2 } from "@/services/r2";
import { randomUUID } from "crypto";

const REVIEW_SUBMISSION_MAX = 10;
const REVIEW_SUBMISSION_WINDOW_MS = 15 * 60 * 1000;

const ACCEPTED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5MB, same cap as the admin upload endpoint

const reviewSubmissionSchema = z.object({
  guestName: z.string().trim().min(2, "Enter your name.").max(120),
  rating: z.coerce.number().int().min(1, "Choose a rating.").max(5),
  quote: z.string().trim().min(10, "Tell us a bit more about your stay.").max(500),
});

export async function POST(request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  // Rate limit — same 10/15min "contact form" tier as the walk-in
  // inquiry and booking form endpoints (Rule 32.1).
  const { allowed } = await checkRateLimit(`review-submission:${ip}`, REVIEW_SUBMISSION_MAX, REVIEW_SUBMISSION_WINDOW_MS);
  if (!allowed) {
    await logSecurityEvent({
      eventType: "rate_limit_hit",
      actor: null,
      request,
      details: `Exceeded ${REVIEW_SUBMISSION_MAX} review submissions within 15 minutes.`,
    });
    return NextResponse.json(
      { success: false, data: null, message: "Too many attempts. Please try again in a bit." },
      { status: 429 }
    );
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { success: false, data: null, message: "Please check the form for errors." },
      { status: 400 }
    );
  }

  let payload;
  try {
    payload = reviewSubmissionSchema.parse({
      guestName: formData.get("guestName"),
      rating: formData.get("rating"),
      quote: formData.get("quote"),
    });
  } catch (validationError) {
    const firstIssue = validationError?.issues?.[0]?.message;
    return NextResponse.json(
      { success: false, data: null, message: firstIssue || "Please check the form for errors." },
      { status: 400 }
    );
  }

  // Defense-in-depth detection layer (Rule 39) — Prisma already makes
  // real SQL injection structurally impossible; this just logs the
  // attempt so it's visible in Security Logs.
  const sqliHit = scanForSqlInjection(payload);
  if (sqliHit) {
    await logSecurityEvent({
      eventType: "sql_injection_attempt",
      actor: null,
      request,
      details: `Suspicious pattern detected in field "${sqliHit}" on review submission form.`,
    });
    return NextResponse.json(
      { success: false, data: null, message: "Please check the form for errors." },
      { status: 400 }
    );
  }

  // Photo is optional — a review can be submitted with no photo.
  let guestPhoto = null;
  let guestPhotoKey = null;
  const photoFile = formData.get("photo");

  if (photoFile && typeof photoFile === "object" && photoFile.size > 0) {
    if (!ACCEPTED_PHOTO_TYPES.includes(photoFile.type)) {
      return NextResponse.json(
        { success: false, data: null, message: "Only JPEG, PNG, WebP, and GIF photos are accepted." },
        { status: 400 }
      );
    }
    if (photoFile.size > MAX_PHOTO_SIZE) {
      return NextResponse.json(
        { success: false, data: null, message: "Photo is too large. Maximum size is 5MB." },
        { status: 400 }
      );
    }

    try {
      const rawBuffer = Buffer.from(await photoFile.arrayBuffer());
      const processedBuffer = await processImage(rawBuffer);
      guestPhotoKey = `testimonials/${randomUUID()}.webp`;
      guestPhoto = await uploadToR2(guestPhotoKey, processedBuffer, "image/webp");
    } catch (uploadError) {
      console.error("[api/reviews] Failed to upload photo:", uploadError.message);
      return NextResponse.json(
        { success: false, data: null, message: "We couldn't upload your photo. Please try again." },
        { status: 500 }
      );
    }
  }

  try {
    // New reviews go to the end of the display order by default — same
    // convention the super-admin create endpoint uses.
    const lastTestimonial = await prisma.testimonial.findFirst({ orderBy: { displayOrder: "desc" } });
    const nextDisplayOrder = (lastTestimonial?.displayOrder ?? -1) + 1;

    await prisma.testimonial.create({
      data: {
        guestName: payload.guestName,
        guestPhoto,
        guestPhotoKey,
        rating: payload.rating,
        quote: payload.quote,
        source: "visitor",
        // Never approved or featured on submission — a super-admin must
        // review it first under Super-Admin > Testimonials before it can
        // appear anywhere on the public site.
        isApproved: false,
        isFeatured: false,
        displayOrder: nextDisplayOrder,
      },
    });

    // Notable visitor transaction — same treatment as booking_submitted
    // and walkin_inquiry_submitted, so it also appears (with geo) on
    // the Visitor Logs page.
    await logVisitorActivity({
      request,
      action: "review_submitted",
      path: "/visitor",
      details: `${payload.guestName} submitted a ${payload.rating}-star guest review.`,
      withLocation: true,
    }).catch((error) => {
      // Logging must never break a successful submission.
      console.error("[api/reviews] Failed to log visitor activity:", error.message);
    });

    return NextResponse.json({
      success: true,
      data: null,
      message: "Thanks for your review! It'll appear once our team approves it.",
    });
  } catch (error) {
    console.error("[api/reviews] Failed to create review:", error.message);

    // The photo already landed in R2 — clean it up so a failed
    // submission never leaves an orphaned file in the bucket.
    if (guestPhotoKey) {
      await deleteFromR2(guestPhotoKey).catch(() => {});
    }

    return NextResponse.json(
      { success: false, data: null, message: "We couldn't submit your review. Please try again." },
      { status: 500 }
    );
  }
}
