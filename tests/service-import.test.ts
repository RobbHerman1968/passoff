import { describe, expect, it } from "vitest";

describe("rooms service module load", () => {
  it("imports without pulling next-auth / next/server into Vitest", async () => {
    const mod = await import("@/lib/rooms/service");
    expect(typeof mod.addHandoffItem).toBe("function");
    expect(typeof mod.releaseHandoff).toBe("function");
    expect(typeof mod.updatePublicComment).toBe("function");
    expect(typeof mod.completeHandoffDirectUpload).toBe("function");
  });
});
