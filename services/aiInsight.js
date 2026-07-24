/**
 * FILE: services/aiInsight.js
 * PURPOSE:
 * Core generation logic behind the Dashboard's AI Sales Insight widget
 * (villa-azure-ai-insight-and-directions-plan.txt, Part 1's "HIGH-LEVEL
 * FLOW"). Runs once a day via the Vercel Cron route
 * (app/api/cron/ai-insight/route.js) or on-demand via the "Regenerate
 * now" button (app/api/admin/ai-insight/regenerate/route.js) — both
 * call the same generateDailyInsight() below so the two paths can never
 * drift apart.
 *
 * FLOW (matches the plan doc exactly):
 * 1. Pull this resort's own sales data (Booking table — revenue trend,
 *    occupancy, cancellations, last 7/30 days) — buildSalesSummary()
 * 2. Fetch structured weather via services/weather.js (real Google
 *    Weather API call, not Gemini "search grounding" — see that file's
 *    header for why)
 * 3. Prompt Gemini to correlate sales data with the weather context and
 *    return Observation / Likely Cause / Suggested Action + severity
 * 4. Save the result to AiInsightLog
 *
 * "Not enough data" guard: if the resort has very few recent bookings,
 * the prompt explicitly instructs Gemini to say so rather than invent a
 * confident-sounding claim from noise — see the STATUS_INSUFFICIENT
 * branch below.
 *
 * Server-side only — never import this in a "use client" file.
 */
import { prisma } from "@/services/prisma";
import { getResortWeatherForecast } from "@/services/weather";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const MIN_BOOKINGS_FOR_CONFIDENT_INSIGHT = 5;

/**
 * buildSalesSummary
 * Pulls the last 30 days of Booking activity and reduces it to the
 * plain numbers Gemini needs — revenue trend (this week vs last week),
 * occupancy-relevant booking counts, and cancellations. Never sends raw
 * guest PII (names/emails/phones) to Gemini — only aggregate numbers.
 */
async function buildSalesSummary() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const recentBookings = await prisma.booking.findMany({
    where: { createdAt: { gte: thirtyDaysAgo } },
    select: { totalAmount: true, status: true, createdAt: true, bookingType: true },
  });

  const confirmed = recentBookings.filter((b) => b.status === "confirmed");
  const cancelled = recentBookings.filter((b) => b.status === "cancelled");

  const thisWeekRevenue = confirmed
    .filter((b) => b.createdAt >= sevenDaysAgo)
    .reduce((sum, b) => sum + Number(b.totalAmount), 0);
  const lastWeekRevenue = confirmed
    .filter((b) => b.createdAt >= fourteenDaysAgo && b.createdAt < sevenDaysAgo)
    .reduce((sum, b) => sum + Number(b.totalAmount), 0);

  const summaryText =
    `Last 30 days: ${recentBookings.length} total bookings (${confirmed.length} confirmed, ${cancelled.length} cancelled).\n` +
    `This week's confirmed revenue: ₱${thisWeekRevenue.toLocaleString("en-US")}.\n` +
    `Previous week's confirmed revenue: ₱${lastWeekRevenue.toLocaleString("en-US")}.\n` +
    `Booking type mix (30d): ${Object.entries(
      confirmed.reduce((counts, b) => {
        counts[b.bookingType] = (counts[b.bookingType] || 0) + 1;
        return counts;
      }, {})
    )
      .map(([type, count]) => `${type}: ${count}`)
      .join(", ") || "none"}`;

  return { summaryText, totalBookingsLast30Days: recentBookings.length };
}

/**
 * callGeminiForInsight
 * Sends the sales summary + weather context to Gemini and asks for a
 * strict JSON response (responseMimeType: application/json) so this
 * service never has to parse free-form prose. Returns null on any
 * failure — the caller decides how to record that as a "status": "error"
 * row rather than throwing and losing the whole cron run.
 */
async function callGeminiForInsight({ salesSummaryText, weatherSummary, hasEnoughData }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("[aiInsight] GEMINI_API_KEY missing — cannot generate insight.");
    return null;
  }

  const dataGuardInstruction = hasEnoughData
    ? ""
    : "\n\nIMPORTANT: There are very few recent bookings on record. Do NOT invent a confident-sounding cause or trend from this little data — instead set status to \"insufficient_data\" and say so plainly in the observation.";

  const prompt =
    `You are a sales analyst for Villa Azure Resort, a Philippine beach resort. ` +
    `Correlate the resort's own sales data below with the current weather forecast, and produce a short, ` +
    `actionable insight for the owner.\n\n` +
    `SALES DATA (last 30 days):\n${salesSummaryText}\n\n` +
    `WEATHER FORECAST:\n${weatherSummary || "Not available."}\n\n` +
    `Respond ONLY with a JSON object with these exact keys:\n` +
    `- "status": "ok" or "insufficient_data"\n` +
    `- "severity": "normal", "notable", or "urgent" (urgent only for something requiring near-immediate action, ` +
    `e.g. a storm threatening upcoming bookings)\n` +
    `- "observation": one or two plain-English sentences describing what's happening\n` +
    `- "likelyCause": one or two sentences on the probable reason, grounded in the data given — never invent ` +
    `external facts not present in the sales data or weather forecast above\n` +
    `- "suggestedAction": one concrete, practical suggestion the owner could act on today` +
    dataGuardInstruction;

  try {
    const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      console.error(`[aiInsight] Gemini responded ${response.status}: ${bodyText}`);
      return null;
    }

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return null;

    const parsed = JSON.parse(rawText);
    if (!parsed.observation || !parsed.likelyCause || !parsed.suggestedAction) return null;

    return parsed;
  } catch (error) {
    console.error("[aiInsight] Gemini request failed:", error.message);
    return null;
  }
}

/**
 * generateDailyInsight
 * The single entry point both the cron route and the manual "Regenerate
 * now" button call. Always writes exactly one AiInsightLog row — even
 * on failure, so a run that failed is visible on the widget/history
 * instead of just silently not appearing.
 *
 * @param {"cron"|"manual"} triggerSource
 */
export async function generateDailyInsight(triggerSource = "cron") {
  const { summaryText, totalBookingsLast30Days } = await buildSalesSummary();
  const hasEnoughData = totalBookingsLast30Days >= MIN_BOOKINGS_FOR_CONFIDENT_INSIGHT;

  const settings = await prisma.systemSettings.findUnique({
    where: { id: "singleton" },
    select: { resortLatitude: true, resortLongitude: true },
  });

  const weatherSummary = settings?.resortLatitude
    ? await getResortWeatherForecast(settings.resortLatitude, settings.resortLongitude)
    : null;

  const geminiResult = await callGeminiForInsight({
    salesSummaryText: summaryText,
    weatherSummary,
    hasEnoughData,
  });

  if (!geminiResult) {
    return prisma.aiInsightLog.create({
      data: {
        salesSummary: summaryText,
        weatherSummary,
        observation: "We couldn't generate an insight this time.",
        likelyCause: "The AI service didn't return a usable response.",
        suggestedAction: "Try regenerating, or check back after the next scheduled run.",
        severity: "normal",
        status: "error",
        triggerSource,
      },
    });
  }

  return prisma.aiInsightLog.create({
    data: {
      salesSummary: summaryText,
      weatherSummary,
      observation: geminiResult.observation,
      likelyCause: geminiResult.likelyCause,
      suggestedAction: geminiResult.suggestedAction,
      severity: ["normal", "notable", "urgent"].includes(geminiResult.severity) ? geminiResult.severity : "normal",
      status: geminiResult.status === "insufficient_data" ? "insufficient_data" : "ok",
      triggerSource,
    },
  });
}

/**
 * getLatestInsight
 * Read-only fetch for the Dashboard widget — just the newest row, no
 * generation happens here.
 */
export async function getLatestInsight() {
  return prisma.aiInsightLog.findFirst({ orderBy: { generatedAt: "desc" } });
}
