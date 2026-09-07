import type { NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";

const providers: NextAuthConfig["providers"] = [];

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

if (process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET) {
  providers.push(
    GitHub({
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

/**
 * Edge-safe Auth.js config (no DB adapter). Used by `proxy.ts`.
 * Providers that need Node-only APIs belong in `auth.ts`.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  providers,
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isLoggedIn = !!auth?.user;
      const isAuthRoute =
        pathname.startsWith("/login") ||
        pathname.startsWith("/api/auth");
      const isProtected =
        pathname.startsWith("/dashboard") ||
        pathname.startsWith("/account") ||
        pathname.startsWith("/projects") ||
        pathname.startsWith("/rooms") ||
        pathname.startsWith("/api/projects") ||
        pathname.startsWith("/api/account") ||
        pathname.startsWith("/api/billing") ||
        (pathname.startsWith("/api/assets") && !request.nextUrl.searchParams.get("token")) ||
        (pathname.startsWith("/api/integrations") &&
          !pathname.startsWith("/api/integrations/figma/plugin-import"));

      if (isAuthRoute) {
        if (isLoggedIn && pathname.startsWith("/login")) {
          return Response.redirect(new URL("/dashboard", request.nextUrl));
        }
        return true;
      }

      if (isProtected) {
        return isLoggedIn;
      }

      return true;
    },
    jwt({ token, user, account }) {
      if (user?.id) {
        token.sub = user.id;
      }
      if (account?.provider) {
        token.provider = account.provider;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
