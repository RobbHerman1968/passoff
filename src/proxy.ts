import NextAuth from "next-auth";

import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

/** Next.js 16 proxy entry — Auth.js session gate for protected routes. */
export function proxy(...args: Parameters<typeof auth>) {
  return auth(...args);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/account/:path*",
    "/projects/:path*",
    "/rooms/:path*",
    "/login",
    "/api/projects/:path*",
    "/api/account/:path*",
    "/api/billing/:path*",
    "/api/assets/:path*",
    "/api/integrations/figma/((?!plugin-import).*)",
  ],
};
