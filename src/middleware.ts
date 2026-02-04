import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // Only apply to /api routes
  if (request.nextUrl.pathname.startsWith("/api")) {
    // 1. Enforce Same-Origin Policy
    const origin = request.headers.get("origin");
    const referer = request.headers.get("referer");
    const expectedOrigin = request.nextUrl.origin;

    // If Origin header is present, it must match the expected origin
    if (origin && origin !== expectedOrigin) {
      return new NextResponse(
        JSON.stringify({ error: "Forbidden: Invalid Origin" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // If Referer header is present, it must start with the expected origin
    if (referer && !referer.startsWith(expectedOrigin)) {
      return new NextResponse(
        JSON.stringify({ error: "Forbidden: Invalid Referer" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. Enforce Authentication (Cookie Check)
    // We check for the presence of the session cookie.
    // Detailed validation happens in the route handlers.
    const cookieName = process.env.AUTH_COOKIE_NAME || "lms_session";
    const sessionCookie = request.cookies.get(cookieName);

    if (!sessionCookie) {
      return new NextResponse(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
