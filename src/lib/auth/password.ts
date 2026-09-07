import "server-only";

import { compare, hash } from "bcryptjs";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";

const MIN_PASSWORD_LENGTH = 8;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function validatePassword(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

export async function hashPassword(password: string) {
  return hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return compare(password, passwordHash);
}

export async function findUserByEmail(email: string) {
  return (await db.select().from(users).where(eq(users.email, normalizeEmail(email))).limit(1))[0] ?? null;
}

export async function createPasswordUser(input: {
  email: string;
  password: string;
  name?: string;
}) {
  const email = normalizeEmail(input.email);
  if (!email || !email.includes("@")) {
    throw new Error("Enter a valid email address.");
  }
  const passwordError = validatePassword(input.password);
  if (passwordError) throw new Error(passwordError);

  const existing = await findUserByEmail(email);
  if (existing?.passwordHash) {
    throw new Error("An account with that email already exists. Sign in instead.");
  }

  const passwordHash = await hashPassword(input.password);
  const name = input.name?.trim() || email.split("@")[0] || "Pass-Off user";

  if (existing) {
    const [user] = await db
      .update(users)
      .set({
        passwordHash,
        name: existing.name || name,
        authProvider: existing.authProvider || "credentials",
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id))
      .returning();
    return user;
  }

  const [user] = await db
    .insert(users)
    .values({
      email,
      name,
      passwordHash,
      authProvider: "credentials",
    })
    .returning();
  return user;
}
