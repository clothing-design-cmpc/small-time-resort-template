/**
 * FILE: app/api/superAdmin/blocked-ips/route.js
 * ROLE: Super-admin only — protected by proxy.js's normal super_admin
 *       session gate (path starts with /api/superAdmin).
 *
 * PURPOSE:
 * Read-only listing of every row in BlockedIp, for the new
 * /superAdmin/blocked-ips page. Deliberately separate from the hidden
 * vault's "Unban IP" flow (app/api/admin/blocked-ips/route.js) — that
 * route stays gated behind the vault passphrase + OTP + a fresh
 * step-up code specifically because UNBANNING is the sensitive action
 * there. This route only lets any signed-in super-admin SEE who is
 * currently blocked and why, using the session they already have —
 * visibility alone doesn't carry the same risk as lifting a block, so
 * it doesn't need the vault's step-up ceremony.
 *
 * Unbanning is intentionally NOT exposed here. If a legitimate admin
 * gets blocked (see services/breachResponse.js's Step 1 comment on
 * Gatekeeper 3's accepted risk), lifting that block still requires
 * going through the vault recovery page's own "Unban IP" step-up flow —
 * this page is for visibility only.
 *
 * DATA FLOW:
 * 1. BlockedIpsClient fetches GET /api/superAdmin/blocked-ips?page=
 *    on mount and on page change
 * 2. Returns paginated rows, newest first
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";

const PAGE_SIZE = 25;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);

    const [blockedIps, totalCount] = await Promise.all([
      prisma.blockedIp.findMany({
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.blockedIp.count(),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        blockedIps,
        page,
        totalPages: Math.max(1, Math.ceil(totalCount / PAGE_SIZE)),
        totalCount,
      },
      message: "Blocked IPs fetched successfully.",
    });
  } catch (error) {
    console.error("[api/superAdmin/blocked-ips] Failed to fetch:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't load blocked IPs. Please try again." },
      { status: 500 }
    );
  }
}
