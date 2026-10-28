import { test, expect } from "@playwright/test";
test("complete ceremony, refresh recovery, replay and export", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("http://localhost:3000");
  await expect(
    page.getByRole("button", { name: "Draw 3rd prize" }),
  ).toBeEnabled();
  await page.waitForSelector("canvas");
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: "test-results/stage-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Draw 3rd prize" }).dblclick();
  await expect(
    page.getByRole("button", { name: "Continue to 2nd prize" }),
  ).toBeVisible();
  const name = await page.locator(".winner-card h2").innerText();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Reveal saved winner" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Show saved result", exact: true })
    .click();
  await expect(page.locator(".winner-card h2")).toHaveText(name);
  await page.getByRole("button", { name: "Replay reveal" }).click();
  await expect(page.locator(".winner-card h2")).toHaveText(name);
  await page.getByRole("button", { name: "Continue to 2nd prize" }).click();
  await page.getByRole("button", { name: "Draw 2nd prize" }).click();
  await page.getByRole("button", { name: "Continue to 1st prize" }).click();
  await page.getByRole("button", { name: "Draw 1st prize" }).click();
  await page.getByRole("button", { name: "Celebrate all winners" }).click();
  const names = await page.locator(".prize h3").allTextContents();
  expect(new Set(names).size).toBe(3);
  await expect(page.locator(".prize").nth(1)).toContainText("1st PRIZE");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download results" }).click();
  expect((await download).suggestedFilename()).toBe("rehearsal-results.csv");
  await page.screenshot({ path: "test-results/podium.png", fullPage: true });
  expect(errors).toEqual([]);
});
test("mobile preparation and signed-out endpoint", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3000");
  await expect(
    page.getByRole("button", { name: "Draw 3rd prize" }),
  ).toBeEnabled();
  await page.screenshot({
    path: "test-results/stage-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Open event preparation" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  const response = await request.post("http://localhost:3000/api/event", {
    data: { action: "draw" },
  });
  expect(response.ok()).toBe(false);
  expect((await response.json()).event).toBeUndefined();
});
test("full animation, explicit sound and graphics fallback", async ({
  page,
}) => {
  await page.goto("http://localhost:3000");
  await page.waitForSelector("canvas");
  await expect(
    page.getByRole("button", { name: "Enable sound" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Enable sound" }).click();
  await expect(page.getByRole("button", { name: "Mute sound" })).toBeVisible();
  await page.getByRole("button", { name: "Draw 3rd prize" }).click();
  await expect(
    page.getByRole("button", { name: "Show saved result", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Draw 2nd prize" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Continue to 2nd prize" }),
  ).toBeVisible({ timeout: 30000 });
  await page
    .locator("canvas")
    .evaluate((canvas) =>
      canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true })),
    );
  await expect(
    page.getByText(
      "Graphics unavailable. Saved winners can still be revealed below.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue to 2nd prize" }).click();
  await page.getByRole("button", { name: "Draw 2nd prize" }).click();
  await page
    .getByRole("button", { name: "Show saved result", exact: true })
    .click();
  await expect(page.locator(".winner-card h2")).toBeVisible();
});
