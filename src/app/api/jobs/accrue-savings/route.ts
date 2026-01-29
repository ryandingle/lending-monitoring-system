import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { accrueSavingsOnce } from "@/lib/jobs/accrue-savings";
import { createAuditLogStandalone, tryGetAuditRequestContext } from "@/lib/audit";

export const runtime = "nodejs";

function safeEqual(a: string, b: string) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return "";
}

function isAuthorized(req: Request) {
  const expected = process.env.LMS_JOBS_API_KEY || "";
  if (!expected) return false;
  const token = getBearerToken(req) || (req.headers.get("x-job-key") || "");
  if (!token) return false;
  return safeEqual(token, expected);
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const result = await accrueSavingsOnce();
  const tookMs = Date.now() - startedAt;

  try {
    const request = await tryGetAuditRequestContext();
    await createAuditLogStandalone({
      actorType: "SYSTEM",
      actorUserId: null,
      action: "SAVINGS_ACCRUE_JOB",
      entityType: null,
      entityId: null,
      metadata: {
        insertedAccrualRows: result.insertedAccrualRows,
        updatedMembers: result.updatedMembers,
        increment: process.env.SAVINGS_DAILY_INCREMENT || "20.00",
        tookMs,
        source: "api",
      },
      request,
    });
  } catch {
    // ignore audit failures
  }

  return NextResponse.json({ ok: true, ...result, tookMs });
}

