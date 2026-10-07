#!/usr/bin/env node
// Runs every release gate in order and prints a one-line summary per gate.
//
//   npm run test:release              # all gates
//   npm run test:release -- --skip-e2e
//   npm run test:release -- --only=lint,typecheck
//
// Database-backed gates need TEST_DATABASE_URL and PASSOFF_TEST_DATABASE_CONFIRMED=true
// (see docs/RELEASE_AND_OPERATIONS.md). Nothing here ever reads DATABASE_URL for tests.
import { spawnSync } from "node:child_process";

const GATES = [
  { id: "lint", label: "Lint", command: ["npm", "run", "lint"] },
  { id: "typecheck", label: "Type check", command: ["npm", "run", "typecheck"] },
  { id: "unit", label: "Unit and database tests", command: ["npm", "test"] },
  { id: "build", label: "Production build", command: ["npm", "run", "build"] },
  { id: "sdk", label: "SDK size and performance budget", command: ["npm", "run", "sdk:measure"] },
  { id: "e2e", label: "Browser tests (Playwright)", command: ["npm", "run", "test:e2e"] },
];

const args = process.argv.slice(2);
const skipE2e = args.includes("--skip-e2e");
const only = args.find((arg) => arg.startsWith("--only="))?.slice("--only=".length).split(",");

const selected = GATES.filter((gate) => {
  if (only) return only.includes(gate.id);
  if (skipE2e && gate.id === "e2e") return false;
  return true;
});

const results = [];
for (const gate of selected) {
  console.log(`\n=== ${gate.label} ===`);
  const started = Date.now();
  const run = spawnSync(gate.command[0], gate.command.slice(1), { stdio: "inherit" });
  results.push({
    ...gate,
    ok: run.status === 0,
    seconds: Math.round((Date.now() - started) / 1000),
  });
  if (run.status !== 0) break;
}

console.log("\n=== Release gates ===");
for (const result of results) {
  console.log(`${result.ok ? "PASS" : "FAIL"}  ${result.label} (${result.seconds}s)`);
}
const notRun = selected.filter((gate) => !results.some((result) => result.id === gate.id));
for (const gate of notRun) console.log(`SKIP  ${gate.label} (an earlier gate failed)`);

process.exit(results.every((result) => result.ok) ? 0 : 1);
