import { describe, expect, it } from "vitest";

import {
  installationStatusLabel,
  installationStatusTone,
  resolveInstallationStatus,
} from "@/lib/installations/status";

describe("installation status", () => {
  it("maps installation fields to clear text statuses", () => {
    expect(
      installationStatusLabel(
        resolveInstallationStatus({
          isEnabled: false,
          verifiedAt: new Date(),
          lastSeenAt: new Date(),
          allowedOrigins: ["https://example.com"],
        }),
      ),
    ).toBe("Disabled");

    expect(
      installationStatusLabel(
        resolveInstallationStatus({
          isEnabled: true,
          verifiedAt: null,
          lastSeenAt: null,
          allowedOrigins: ["https://example.com"],
          checking: true,
        }),
      ),
    ).toBe("Checking");

    expect(
      installationStatusLabel(
        resolveInstallationStatus({
          isEnabled: true,
          verifiedAt: new Date(),
          lastSeenAt: new Date(),
          allowedOrigins: ["https://example.com"],
        }),
      ),
    ).toBe("Installed");

    expect(
      installationStatusLabel(
        resolveInstallationStatus({
          isEnabled: true,
          verifiedAt: null,
          lastSeenAt: null,
          allowedOrigins: ["https://example.com"],
        }),
      ),
    ).toBe("Not detected");

    expect(
      installationStatusLabel(
        resolveInstallationStatus({
          isEnabled: true,
          verifiedAt: new Date(),
          lastSeenAt: null,
          allowedOrigins: ["https://example.com"],
        }),
      ),
    ).toBe("Needs attention");
  });

  it("calls out installed status with a positive tone", () => {
    expect(installationStatusTone("installed")).toBe("positive");
    expect(installationStatusTone("not_detected")).toBe("open");
    expect(installationStatusTone("needs_attention")).toBe("ready");
    expect(installationStatusTone("disabled")).toBe("muted");
  });
});
