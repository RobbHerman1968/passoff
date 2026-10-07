// @vitest-environment node
import { describe, expect, it } from "vitest";

import { buildLogLine, safeErrorSummary, scrub } from "./diagnostics";

describe("privacy-safe diagnostics", () => {
  it("removes emails, bearer tokens, provider ids, long tokens, and secret query values", () => {
    const text = scrub(
      "failed for jane.doe@client.com Bearer abc.def.ghi cus_ABC123456789 sk_live_ABCDEFGH " +
        "https://x.test/r?token=s3cret&code=zzz " +
        "a".repeat(40),
    );
    expect(text).not.toMatch(/jane\.doe|client\.com|abc\.def|ABC123456789|ABCDEFGH|s3cret|zzz|aaaaaaaa/);
  });

  it("reports an error by class and code only, never by message", () => {
    const error = Object.assign(new Error('duplicate key value (email)=(jane@client.com)'), {
      code: "23505",
    });
    const summary = safeErrorSummary(error);
    expect(summary).toEqual({ errorName: "Error", errorCode: "23505" });
    expect(JSON.stringify(summary)).not.toContain("jane");
    expect(safeErrorSummary("boom")).toEqual({ errorName: "UnknownError" });
  });

  it("writes one JSON line and drops unsafe keys and non-scalar values", () => {
    const line = buildLogLine(
      "error",
      "cron.failed",
      {
        job: "video",
        durationMs: 12,
        ok: false,
        "bad key": "x",
        nested: { secret: "x" } as unknown as string,
        email: "jane@client.com",
        missing: undefined,
      },
      new Date("2026-01-01T00:00:00Z"),
    );
    const parsed = JSON.parse(line);
    expect(parsed).toMatchObject({ ts: "2026-01-01T00:00:00.000Z", level: "error", event: "cron.failed", job: "video", durationMs: 12, ok: false });
    expect(parsed["bad key"]).toBeUndefined();
    expect(parsed.email).toBe("[email]");
    expect(JSON.stringify(parsed.nested ?? "")).not.toContain("secret");
  });
});

describe("reserved log keys", () => {
  it("cannot be overwritten by caller fields", () => {
    const parsed = JSON.parse(buildLogLine("error", "x.y", { level: "info", ts: "never", event: "z" }));
    expect(parsed.level).toBe("error");
    expect(parsed.event).toBe("x.y");
    expect(parsed.ts).not.toBe("never");
  });
});
