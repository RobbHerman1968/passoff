import { describe, expect, it } from "vitest";

import {
  getPassoffEmbedBaseUrl,
  getSdkBootstrapUrl,
} from "@/lib/installations/embed-config";
import { PASSOFF_SDK_VERSION } from "../../../packages/website-sdk/version";

describe("embed config", () => {
  it("requires a validated absolute http(s) base URL", () => {
    expect(getPassoffEmbedBaseUrl({}).ok).toBe(false);
    expect(
      getPassoffEmbedBaseUrl({
        PASSOFF_EMBED_BASE_URL: "https://app.example.com/",
      }),
    ).toEqual({ ok: true, baseUrl: "https://app.example.com" });
    expect(
      getPassoffEmbedBaseUrl({
        PASSOFF_EMBED_BASE_URL: "https://user:pass@app.example.com",
      }).ok,
    ).toBe(false);
  });

  it("builds the production bootstrap URL", () => {
    expect(getSdkBootstrapUrl("https://app.example.com")).toBe(
      `https://app.example.com/sdk/v1/passoff.js?v=${PASSOFF_SDK_VERSION}`,
    );
  });
});
