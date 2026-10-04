import { expect, type Page } from "@playwright/test";

export function breadcrumb(page: Page) {
  return page.getByRole("navigation", { name: "Breadcrumb" });
}

/** Opens a project or review from the list on the current page, not the sidebar. */
export async function openFromList(page: Page, name: string) {
  await page.getByRole("main").getByRole("link", { name, exact: true }).click();
}

export async function signOut(page: Page) {
  const trigger = page.locator('button[aria-label^="Account:"]:visible').first();
  const signOutItem = page.getByRole("menuitem", { name: "Sign out" });
  // The menu only opens once the page has hydrated, so retry the click.
  await expect(async () => {
    if (!(await signOutItem.isVisible())) await trigger.click();
    await expect(signOutItem).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await signOutItem.click();
}
