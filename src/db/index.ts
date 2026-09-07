import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";

import * as schema from "./schema";

// neon-http cannot run transactions; plugin import needs them for replace/append batches.
neonConfig.webSocketConstructor = ws;

const globalForDb = globalThis as unknown as { __passoffPgPool?: Pool };

function getPool() {
  if (!globalForDb.__passoffPgPool) {
    globalForDb.__passoffPgPool = new Pool({ connectionString: process.env.DATABASE_URL! });
  }
  return globalForDb.__passoffPgPool;
}

export const db = drizzle({ client: getPool(), schema });
