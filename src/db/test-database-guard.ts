type Env = Record<string, string | undefined>;

function databaseIdentity(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    // Host, port, and database name decide which data is touched. Credentials and
    // query options do not.
    return `${url.hostname.toLowerCase()}:${url.port || "5432"}${url.pathname}`;
  } catch {
    return null;
  }
}

/**
 * Decides which database a test process may open, or explains why it may not.
 * Automated tests only ever use TEST_DATABASE_URL, never DATABASE_URL.
 */
export function resolveTestDatabaseUrl(env: Env): string {
  const testUrl = env.TEST_DATABASE_URL;
  if (!testUrl) {
    throw new Error(
      "TEST_DATABASE_URL is required for database tests. Ordinary DATABASE_URL is never used by tests.",
    );
  }
  if (!databaseIdentity(testUrl)) {
    throw new Error("TEST_DATABASE_URL is not a valid database connection string.");
  }
  if (env.PASSOFF_TEST_DATABASE_CONFIRMED !== "true") {
    throw new Error(
      "Set PASSOFF_TEST_DATABASE_CONFIRMED=true only after confirming TEST_DATABASE_URL points to an isolated, disposable test database.",
    );
  }

  const sameAsApp = databaseIdentity(testUrl) === databaseIdentity(env.DATABASE_URL);
  if (sameAsApp && env.PASSOFF_TEST_DATABASE_SHARED_WITH_APP !== "true") {
    throw new Error(
      "TEST_DATABASE_URL points at the same database as DATABASE_URL. Create a separate disposable database (for example a Neon branch). " +
        "Only set PASSOFF_TEST_DATABASE_SHARED_WITH_APP=true on a personal development machine whose DATABASE_URL holds no customer data.",
    );
  }

  return testUrl;
}
