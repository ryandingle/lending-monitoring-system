import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // Only apply to /api routes
  if (request.nextUrl.pathname.startsWith("/api")) {
    // 1. Enforce Same-Origin Policy
    const origin = request.headers.get("origin");
    const referer = request.headers.get("referer");
    
    // We check against the Host header to handle protocol mismatches (e.g. http vs https behind proxy)
    const host = request.headers.get("host");
    
    // Helper to extract hostname from url
    const getHostname = (url: string) => {
      try {
        return new URL(url).host;
      } catch {
        return null;
      }
    };

    // If Origin header is present, it must match the expected host
    if (origin) {
      const originHost = getHostname(origin);
      if (originHost && host && originHost !== host) {
        // Allow localhost in development
        if (process.env.NODE_ENV === "development" && (originHost.includes("localhost") || originHost.includes("127.0.0.1"))) {
          // Allowed in dev
        } else {
          return new NextResponse(
            JSON.stringify({ error: "Forbidden: Invalid Origin" }),
            { status: 403, headers: { "Content-Type": "application/json" } }
          );
        }
      }
    }

    // If Referer header is present, it must match the expected host
    if (referer) {
      const refererHost = getHostname(referer);
      if (refererHost && host && refererHost !== host) {
        // Allow localhost in development
        if (process.env.NODE_ENV === "development" && (refererHost.includes("localhost") || refererHost.includes("127.0.0.1"))) {
           // Allowed in dev
        } else {
          return new NextResponse(
            JSON.stringify({ error: "Forbidden: Invalid Referer" }),
            { status: 403, headers: { "Content-Type": "application/json" } }
          );
        }
      }
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
