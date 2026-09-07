import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";

import { authConfig } from "@/auth.config";
import { db } from "@/db";
import {
  accounts,
  authenticators,
  sessions,
  users,
  verificationTokens,
} from "@/db/schema";
import { findUserByEmail, normalizeEmail, verifyPassword } from "@/lib/auth/password";
import { createPrivateTenantForUser } from "@/lib/auth/tenant-membership";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
    authenticatorsTable: authenticators,
  }),
  session: { strategy: "jwt" },
  providers: [
    ...authConfig.providers,
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === "string" ? normalizeEmail(credentials.email) : "";
        const password = typeof credentials?.password === "string" ? credentials.password : "";
        if (!email || !password) return null;

        const user = await findUserByEmail(email);
        if (!user?.passwordHash) return null;
        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
  ],
  events: {
    async createUser({ user }) {
      if (!user.id) return;
      await createPrivateTenantForUser(user.id);
    },
    async linkAccount({ user, account }) {
      if (!user.id) return;
      await db
        .update(users)
        .set({
          authProvider: account.provider,
          authProviderUserId: account.providerAccountId,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));
    },
  },
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account }) {
      if (user.id && account) {
        await db
          .update(users)
          .set({
            authProvider: account.provider,
            authProviderUserId:
              account.provider === "credentials" ? user.email ?? account.providerAccountId : account.providerAccountId,
            name: user.name ?? undefined,
            image: user.image ?? undefined,
            updatedAt: new Date(),
          })
          .where(eq(users.id, user.id));
        await createPrivateTenantForUser(user.id);
      }
      return true;
    },
  },
});
