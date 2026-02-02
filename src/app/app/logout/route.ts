import { NextRequest, NextResponse } from "next/server";
import { destroySession } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  await destroySession();
  const loginUrl = new URL("/login", process.env.APP_URL || request.url);
  return NextResponse.redirect(loginUrl);
}

