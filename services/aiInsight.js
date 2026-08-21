/**
 * FILE: services/aiInsight.js
 * PURPOSE:
 * Core generation logic behind the Dashboard's AI Sales Insight widget.
 * Runs once a day via the Vercel Cron route (app/api/cron/ai-insight/route.js)
 * or on-demand via the "Regenerate now" button
 * (app/api/admin/ai-insight/regenerate/route.js) — both call the same
 * generateDailyInsight() below so the two paths can never drift apart.
 *
 * FLOW:
 * 1. Pull this resort's own sales data (Booking table — revenue trend,
 *    occupancy, cancellations, last 7/30 days) — buildSalesSummary()
 * 2. Fetch structured weather via services/weather.js (real Google
 *    Weather API call, not Gemini "search grounding" — see that file's
 *    header for why)
 * 3. Fetch broader market/economic context via Gemini + Google Search
 *    grounding — upcoming Philippine holidays/local events near the
 *    resort and general travel/leisure-spending sentiment —
 *    getMarketContext(). Unlike weather, this genuinely needs live web
 *    search (holidays, economic sentiment, local events aren't
 *    available from a structured API the way a forecast is), so this
 *    is the one place in the app that actually uses grounding.
 * 4. Prompt Gemini to correlate sales data with the weather AND market
 *    context and return Observation / Likely Cause / Suggested Action
 *    + severity
 * 5. Save the result to AiInsightLog, including the market context
 *    summary and its citation sources for transparency
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
import { recordApiCall } from "@/services/apiUsageTracker";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const MIN_BOOKINGS_FOR_CONFIDENT_INSIGHT = 5;

// Max citation links kept per market-context run — Gemini's grounding
// metadata can return many overlapping chunks for the same search; the
// widget only needs a handful for the owner to spot-check, not a full
// bibliography.
const MAX_MARKET_SOURCES = 5;

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
 * getMarketContext
 * Uses Gemini with the Google Search grounding tool to pull live,
 * current-as-of-today context a structured API can't provide:
 * upcoming Philippine holidays/long weekends and local events near the
 * resort in the next ~30 days, and general sentiment on travel/leisure
 * spending (e.g. inflation, peso exchange rate, tourism industry
 * reports). This is genuinely a "search the web" task, unlike weather
 * (services/weather.js), which stays on a real structured API because
 * grounding would be less reliable and more expensive for that.
 *
 * Grounding is incompatible with Gemini's strict JSON response mode, so
 * this call returns free-form prose — it's fed into the final
 * structured call (callGeminiForInsight) the same way weatherSummary
 * already is, never parsed as JSON itself.
 *
 * Returns { summary: string|null, sources: string[] } — both empty/null
 * when GEMINI_API_KEY is missing or the call fails, so a bad web search
 * never blocks the rest of the daily insight (same graceful-degrade
 * pattern as getResortWeatherForecast).
 *
 * @param {string|null} resortAddress
 * @param {string|null} resortName
 */
async function getMarketContext(resortAddress, resortName) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("[aiInsight] GEMINI_API_KEY missing — skipping market context search.");
    return { summary: null, sources: [] };
  }

  const locationLabel = resortAddress || "the Philippines";
  const prompt =
    `Search for current, up-to-date information relevant to ${resortName || "a small private resort"} ` +
    `located near ${locationLabel}. Specifically look for:\n` +
    `1. Any Philippine national holidays, long weekends, or local town/provincial events happening in the next 30 days ` +
    `that could drive travel or booking demand near that location.\n` +
    `2. General current sentiment on Philippine consumer/leisure travel spending — inflation, peso exchange rate ` +
    `trends, tourism industry reports, or anything indicating whether people are spending more or less on travel right now.\n\n` +
    `Summarize your findings in 3-5 plain-English sentences, written for a resort owner who wants to know if there's ` +
    `an upcoming opportunity (e.g. a long weekend to promote) or headwind (e.g. weak consumer spending) worth acting on. ` +
    `If you find nothing notable, say so plainly rather than padding the summary.`;

  try {
    const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
      }),
    });

    recordApiCall("gemini_search_grounding", "generate_content_grounded", response.ok);

    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      console.error(`[aiInsight] Gemini (search grounding) responded ${response.status}: ${bodyText}`);
      return { summary: null, sources: [] };
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    const summary = candidate?.content?.parts?.map((part) => part.text).filter(Boolean).join(" ") || null;

    // Grounding chunks carry the actual source URLs Gemini drew from —
    // dedupe and cap so the widget shows a short, useful citation list
    // rather than every chunk the search touched.
    const groundingChunks = candidate?.groundingMetadata?.groundingChunks ?? [];
    const sources = [...new Set(groundingChunks.map((chunk) => chunk.web?.uri).filter(Boolean))].slice(
      0,
      MAX_MARKET_SOURCES
    );

    return { summary, sources };
  } catch (error) {
    console.error("[aiInsight] Gemini market context request failed:", error.message);
    return { summary: null, sources: [] };
  }
}

/**
 * callGeminiForInsight
 * Sends the sales summary + weather context + market/economic context
 * to Gemini and asks for a strict JSON response (responseMimeType:
 * application/json) so this service never has to parse free-form
 * prose. Returns null on any failure — the caller decides how to
 * record that as a "status": "error" row rather than throwing and
 * losing the whole cron run.
 */
async function callGeminiForInsight({ salesSummaryText, weatherSummary, marketSummary, hasEnoughData }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("[aiInsight] GEMINI_API_KEY missing — cannot generate insight.");
    return null;
  }

  const dataGuardInstruction = hasEnoughData
    ? ""
    : "\n\nIMPORTANT: There are very few recent bookings on record. Do NOT invent a confident-sounding cause or trend from this little data — instead set status to \"insufficient_data\" and say so plainly in the observation.";

  const prompt =
    `You are a sales analyst for a small private resort in the Philippine province. ` +
    `Correlate the resort's own sales data below with the current weather forecast and the market/economic context, ` +
    `and produce a short, actionable insight for the owner focused on concrete ways to grow sales — not just an ` +
    `observation.\n\n` +
    `SALES DATA (last 30 days):\n${salesSummaryText}\n\n` +
    `WEATHER FORECAST:\n${weatherSummary || "Not available."}\n\n` +
    `MARKET & ECONOMIC CONTEXT (from live web search):\n${marketSummary || "Not available."}\n\n` +
    `Respond ONLY with a JSON object with these exact keys:\n` +
    `- "status": "ok" or "insufficient_data"\n` +
    `- "severity": "normal", "notable", or "urgent" (urgent only for something requiring near-immediate action, ` +
    `e.g. a storm threatening upcoming bookings, or a major demand opportunity closing soon)\n` +
    `- "observation": one or two plain-English sentences describing what's happening\n` +
    `- "likelyCause": one or two sentences on the probable reason, grounded in the sales data, weather forecast, ` +
    `and market context given above — never invent external facts not present in those three inputs\n` +
    `- "suggestedAction": one concrete, practical suggestion the owner could act on today to grow sales — draw on ` +
    `the market context (e.g. an upcoming holiday to promote, a spending headwind to price around) when it's relevant` +
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

    recordApiCall("gemini", "generate_content", response.ok);

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
    select: { resortLatitude: true, resortLongitude: true, resortAddress: true, siteTitle: true },
  });

  const weatherSummary = settings?.resortLatitude
    ? await getResortWeatherForecast(settings.resortLatitude, settings.resortLongitude)
    : null;

  // Market/economic context runs independently of weather — a missing
  // or failed search must never block the weather-only insight, and
  // vice versa (same graceful-degrade principle as the rest of this file).
  const { summary: marketSummary, sources: marketSources } = await getMarketContext(
    settings?.resortAddress,
    settings?.siteTitle
  );

  const geminiResult = await callGeminiForInsight({
    salesSummaryText: summaryText,
    weatherSummary,
    marketSummary,
    hasEnoughData,
  });

  if (!geminiResult) {
    return prisma.aiInsightLog.create({
      data: {
        salesSummary: summaryText,
        weatherSummary,
        marketContext: marketSummary,
        marketSources,
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
      marketContext: marketSummary,
      marketSources,
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
