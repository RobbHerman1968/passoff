import { describe, expect, it } from "vitest";

import {
  buildInstallSnippet,
  escapeHtmlAttribute,
  snippetContainsForbiddenSecrets,
} from "@/lib/installations/snippet";

const KEY = "pk_0123456789abcdef0123456789abcdef";

describe("install snippet", () => {
  it("builds a copyable snippet with the public key and configured embed host", () => {
    const snippet = buildInstallSnippet({
      installationKey: KEY,
      embedBaseUrl: "https://app.example.com",
    });

    expect(snippet).toContain('window.Passoff("configure"');
    expect(snippet).toContain(KEY);
    expect(snippet).toContain(
      'src="https://app.example.com/sdk/v1/passoff.js?v=1.0.12"',
    );
    expect(snippet).toContain(`data-passoff-key="${KEY}"`);
    expect(snippet).toMatch(/async/);
    expect(snippetContainsForbiddenSecrets(snippet)).toBe(false);
  });

  it("escapes attribute values safely", () => {
    expect(escapeHtmlAttribute(`a"b'c<d>e&f`)).toBe(
      "a&quot;b&#39;c&lt;d&gt;e&amp;f",
    );
  });

  it("rejects invalid installation keys instead of interpolating them", () => {
    expect(() =>
      buildInstallSnippet({
        installationKey: 'pk_"></script><script>',
        embedBaseUrl: "https://app.example.com",
      }),
    ).toThrow(/invalid installation key/i);
  });

  it("never includes the prototype session or reusable secrets", () => {
    const snippet = buildInstallSnippet({
      installationKey: KEY,
      embedBaseUrl: "https://embed.passoff.test",
    });
    expect(snippet.toLowerCase()).not.toContain("passoff-prototype-m0");
    expect(snippet.toLowerCase()).not.toContain("session");
    expect(snippet).not.toMatch(/sk_/i);
    expect(snippet).not.toMatch(/bearer/i);
  });
});
