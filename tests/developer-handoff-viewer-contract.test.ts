import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("developer handoff public viewer data source", () => {
  const viewer = readFileSync(
    path.join(
      process.cwd(),
      "src/app/developer-handoff/[token]/developer-handoff-viewer.tsx",
    ),
    "utf8",
  );
  const page = readFileSync(
    path.join(process.cwd(), "src/app/developer-handoff/[token]/page.tsx"),
    "utf8",
  );
  const publisher = readFileSync(
    path.join(
      process.cwd(),
      "src/app/projects/[key]/project-files/[fileKey]/handoff/developer-handoff-publisher.tsx",
    ),
    "utf8",
  );

  it("loads only the immutable developer-handoff token API", () => {
    expect(viewer).toContain(
      "fetch(`/api/developer-handoff/${encodeURIComponent(token)}`, { cache: \"no-store\" })",
    );
    expect(viewer.match(/\bfetch\s*\(/g)).toHaveLength(1);

    for (const forbidden of [
      "/api/integrations/figma/import",
      "/api/integrations/figma/screens",
      "/api/integrations/figma/explanations",
      "/api/integrations/figma/previews",
    ]) {
      expect(viewer).not.toContain(forbidden);
      expect(page).not.toContain(forbidden);
    }
  });

  it("keeps a newly issued bearer URL recoverable and confirms revocation", () => {
    const retainLink = publisher.indexOf("setRecoverableLink(link)");
    const refreshSummary = publisher.indexOf("await load()", retainLink);

    expect(retainLink).toBeGreaterThan(-1);
    expect(refreshSummary).toBeGreaterThan(retainLink);
    expect(publisher).toContain("value={recoverableLink.url}");
    expect(publisher).toContain("Latest secure link");
    expect(publisher).toContain("Revoke developer handoff access?");
    expect(publisher).toContain("setOpen(false)");
  });
});
