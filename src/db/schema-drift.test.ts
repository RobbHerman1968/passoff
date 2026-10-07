import { getTableColumns, getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { pool } from "@/db";
import * as schema from "@/db/schema";

// Needs TEST_DATABASE_URL, migrated with `npm run db:migrate:test`. Never uses DATABASE_URL.
// Catches the failure a unit test with mocks cannot: code that reads a table or column that no
// migration creates (the issue export once failed this way in production-like databases).
describe("database matches src/db/schema.ts", () => {
  it("has every table and column the code reads, after all migrations", async () => {
    const { rows } = await pool.query<{ table_name: string; column_name: string }>(
      "select table_name, column_name from information_schema.columns where table_schema = 'public'",
    );
    const live = new Map<string, Set<string>>();
    for (const row of rows) {
      if (!live.has(row.table_name)) live.set(row.table_name, new Set());
      live.get(row.table_name)!.add(row.column_name);
    }

    const missing: string[] = [];
    for (const value of Object.values(schema)) {
      if (!is(value, PgTable)) continue;
      const name = getTableName(value);
      const columns = live.get(name);
      if (!columns) {
        missing.push(`table ${name}`);
        continue;
      }
      for (const column of Object.values(getTableColumns(value))) {
        if (!columns.has(column.name)) missing.push(`column ${name}.${column.name}`);
      }
    }
    expect(missing, "Run `npm run db:migrate:test`, or add a migration for these.").toEqual([]);
  });
});
