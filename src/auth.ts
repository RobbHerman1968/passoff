import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { authConfig } from "@/auth.config";
import { db } from "@/db";
import {
  accounts,
  authenticators,
  sessions,
  users,
  verificationTokens,
} from "@/db/schema";
import { clearStaleAuthSessionCookies } from "@/lib/auth/clear-stale-session";
import { credentialsSignInSchema } from "@/lib/auth/schemas";
import {
  authenticateWithPassword,
  getUserAuthState,
  getUserSessionVersion,
} from "@/lib/auth/users";

/**
 * Session strategy: JWT.
 *
 * Auth.js Credentials cannot use database sessions (`UnsupportedStrategy`).
 * Google/GitHub still use the Drizzle adapter for user/account persistence.
 * Password reset invalidates JWTs by bumping `users.sessionVersion` and
 * rejecting tokens that carry a stale version.
 */
export const { auth, handlers, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
    authenticatorsTable: authenticators,
  }),
  providers: [
    ...authConfig.providers,
    Credentials({
      id: "credentials",
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSignInSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        const user = await authenticateWithPassword(
          parsed.data.email,
          parsed.data.password,
        );

        if (!user) {
          return null;
        }

        const authState = await getUserAuthState(user.id);

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          sessionVersion: user.sessionVersion,
          platformRole: authState?.platformRole ?? "user",
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user?.id) {
        const authState = await getUserAuthState(user.id);
        const version =
          typeof user.sessionVersion === "number"
            ? user.sessionVersion
            : (authState?.sessionVersion ?? 1);

        token.sub = user.id;
        token.sessionVersion = version;
        token.platformRole = authState?.platformRole ?? "user";
        token.name = user.name;
        token.email = user.email;
        token.picture = user.image;
        return token;
      }

      if (!token.sub) {
        return null;
      }

      const authState = await getUserAuthState(token.sub);
      if (
        authState === null ||
        typeof token.sessionVersion !== "number" ||
        authState.sessionVersion !== token.sessionVersion
      ) {
        return null;
      }

      // Refresh display-only platformRole on every JWT check so role changes
      // are not stuck behind an indefinitely cached session claim.
      token.platformRole = authState.platformRole;
      // A name changed in account settings shows up on the next request.
      if (authState.name) token.name = authState.name;
      return token;
    },
    async session({ session, token }) {
      if (!token.sub) {
        return session;
      }

      session.user = {
        ...session.user,
        id: token.sub,
        name: typeof token.name === "string" ? token.name : session.user.name,
        email: typeof token.email === "string" ? token.email : session.user.email,
        image:
          typeof token.picture === "string" ? token.picture : session.user.image,
        platformRole:
          token.platformRole === "admin" || token.platformRole === "user"
            ? token.platformRole
            : "user",
      };

      return session;
    },
  },
});

export async function getValidSession() {
  // Drop legacy database-session cookies before Auth.js tries to decrypt them.
  await clearStaleAuthSessionCookies();

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return null;
    }

    const version = await getUserSessionVersion(session.user.id);
    if (version === null) {
      return null;
    }

    return session;
  } catch {
    // Stale or undecryptable JWT cookies should not break public auth pages.
    return null;
  }
}
