import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      /** Display convenience only. Never authorize from this alone. */
      platformRole?: "user" | "admin";
    } & DefaultSession["user"];
  }

  interface User {
    sessionVersion?: number;
    platformRole?: "user" | "admin";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    sessionVersion?: number;
    /** Display convenience only. Re-read from the database on each JWT check. */
    platformRole?: "user" | "admin";
    invalidated?: boolean;
  }
}
