// @vitest-environment node
import { describe, expect, it } from "vitest";

import { resolveTestDatabaseUrl } from "./test-database-guard";

const TEST = "postgresql://u:p@ep-test.neon.tech:5432/passoff_test?sslmode=require";
const APP = "postgresql://u:p@ep-prod.neon.tech:5432/passoff?sslmode=require";

describe("resolveTestDatabaseUrl", () => {
  it("returns the test database when it is confirmed and separate", () => {
    expect(
      resolveTestDatabaseUrl({
        TEST_DATABASE_URL: TEST,
        DATABASE_URL: APP,
        PASSOFF_TEST_DATABASE_CONFIRMED: "true",
      }),
    ).toBe(TEST);
  });

  it("never falls back to DATABASE_URL", () => {
    expect(() =>
      resolveTestDatabaseUrl({ DATABASE_URL: APP, PASSOFF_TEST_DATABASE_CONFIRMED: "true" }),
    ).toThrow(/TEST_DATABASE_URL is required/);
  });

  it("requires explicit confirmation", () => {
    expect(() => resolveTestDatabaseUrl({ TEST_DATABASE_URL: TEST, DATABASE_URL: APP })).toThrow(
      /PASSOFF_TEST_DATABASE_CONFIRMED/,
    );
  });

  it("rejects an unparseable URL", () => {
    expect(() =>
      resolveTestDatabaseUrl({
        TEST_DATABASE_URL: "not a url",
        PASSOFF_TEST_DATABASE_CONFIRMED: "true",
      }),
    ).toThrow(/valid database connection string/);
  });

  it("refuses the same database as DATABASE_URL even with different credentials or options", () => {
    expect(() =>
      resolveTestDatabaseUrl({
        TEST_DATABASE_URL: "postgresql://other:pw@ep-prod.neon.tech/passoff?channel_binding=require",
        DATABASE_URL: APP,
        PASSOFF_TEST_DATABASE_CONFIRMED: "true",
      }),
    ).toThrow(/same database as DATABASE_URL/);
  });

  it("allows sharing only with the explicit personal-machine opt-in", () => {
    expect(
      resolveTestDatabaseUrl({
        TEST_DATABASE_URL: APP,
        DATABASE_URL: APP,
        PASSOFF_TEST_DATABASE_CONFIRMED: "true",
        PASSOFF_TEST_DATABASE_SHARED_WITH_APP: "true",
      }),
    ).toBe(APP);
  });
});
