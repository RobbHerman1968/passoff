import type { NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";

import { sanitizeCallbackUrl } from "@/lib/auth/callback-url";

/**
 * Edge-safe Auth.js config for proxy/optimistic checks.
 * Credentials authorize and session-version checks live in `src/auth.ts`.
 */
export const authConfig = {
  pages: {
    signIn: "/sign-in",
    error: "/sign-in",
  },
  providers: [
    Google({
      allowDangerousEmailAccountLinking: false,
    }),
    GitHub({
      allowDangerousEmailAccountLinking: false,
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isProtected =
        pathname === "/dashboard" ||
        pathname.startsWith("/dashboard/") ||
        pathname === "/projects" ||
        pathname.startsWith("/projects/") ||
        pathname === "/onboarding" ||
        pathname.startsWith("/onboarding/") ||
        pathname === "/admin" ||
        pathname.startsWith("/admin/");

      if (!isProtected) {
        return true;
      }

      return Boolean(auth?.user);
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) {
        return `${baseUrl}${sanitizeCallbackUrl(url)}`;
      }

      try {
        const target = new URL(url);
        if (target.origin === baseUrl) {
          return `${baseUrl}${sanitizeCallbackUrl(
            `${target.pathname}${target.search}${target.hash}`,
          )}`;
        }
      } catch {
        // Fall through.
      }

      return baseUrl;
    },
  },
  trustHost: true,
} satisfies NextAuthConfig;
