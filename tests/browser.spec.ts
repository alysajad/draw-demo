import { test, expect } from "@playwright/test";
test("complete ceremony, refresh recovery, replay and export", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("http://localhost:3000");
  await page.getByRole("button", { name: /Kayamkulam 0\/3/ }).click();
  await expect(page.locator(".branch-progress h2")).toHaveText("Kayamkulam");
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
  await expect(page.locator(".coin-entry")).toContainText("Kayamkulam");
  for (const [index, branch] of ["Enjakkal", "Kalamaserry", "Irinjalkuda"].entries()) {
    await page.getByRole("button", { name: "Choose another branch" }).click();
    await page.getByRole("button", { name: new RegExp(`${branch} 0/3`) }).click();
    await expect(page.locator(".branch-progress h2")).toHaveText(branch);
    for (const rank of ["3rd", "2nd", "1st"]) {
      await page.getByRole("button", { name: `Draw ${rank} prize` }).click();
      await expect(page.locator(".coin-entry")).toContainText(branch);
      if (rank !== "1st") await page.getByRole("button", { name: `Continue to ${rank === "3rd" ? "2nd" : "1st"} prize` }).click();
    }
    if (index === 2) await page.getByRole("button", { name: "Celebrate all winners" }).click();
  }
  await expect(page.locator(".prize")).toHaveCount(12);
  const ids = await page.locator(".prize p").allTextContents();
  expect(new Set(ids).size).toBe(12);
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
  const revealStarted = Date.now();
  await page.getByRole("button", { name: "Draw 3rd prize" }).click();
  await expect(
    page.getByRole("button", { name: "Show saved result", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Draw 2nd prize" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Continue to 2nd prize" }),
  ).toBeVisible({ timeout: 10000 });
  expect(Date.now() - revealStarted).toBeGreaterThanOrEqual(4500);
  expect(Date.now() - revealStarted).toBeLessThan(7000);
  await expect(page.locator(".coin-reveal")).toBeVisible();
  await expect(page.locator(".coin-winner")).toHaveText(await page.locator(".winner-card h2").innerText());
  await expect(page.locator("canvas")).toHaveCount(0);
  const frameTimes = await page.evaluate(() => new Promise<number[]>(resolve => {
    const samples: number[] = [];
    let previous = performance.now();
    function sample(now: number) {
      samples.push(now - previous);
      previous = now;
      if (samples.length < 120) requestAnimationFrame(sample);
      else resolve(samples.slice(1));
    }
    requestAnimationFrame(sample);
  }));
  console.log(`Gold reveal: ${(1000 / (frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length)).toFixed(1)} average FPS in headless Chromium`);
  await page.screenshot({ path: "test-results/gold-coin-desktop.png" });
  await page.getByRole("button", { name: "Continue to 2nd prize" }).click();
  await page.waitForSelector("canvas");
  await page.waitForTimeout(1500);
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
  await page.getByRole("button", { name: "Draw 2nd prize" }).click();
  await page
    .getByRole("button", { name: "Show saved result", exact: true })
    .click();
  await expect(page.locator(".winner-card h2")).toBeVisible();
});

test("gold coin reveal fits mobile and respects reduced motion", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("http://localhost:3000");
  await page.getByRole("button", { name: "Draw 3rd prize" }).click();
  await expect(page.locator(".coin-winner")).toBeVisible();
  await expect(page.locator(".coin-rain")).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveCount(0);
  const result = await page.locator(".coin-result").boundingBox();
  const controls = await page.locator(".draw-controls").boundingBox();
  expect(result!.x).toBeGreaterThanOrEqual(0);
  expect(result!.x + result!.width).toBeLessThanOrEqual(390);
  expect(result!.y + result!.height).toBeLessThan(controls!.y);
  await page.screenshot({ path: "test-results/gold-coin-mobile.png" });
  const name = await page.locator(".coin-winner").innerText();
  await page.getByRole("button", { name: "Replay reveal" }).click();
  await expect(page.locator(".coin-winner")).toHaveText(name);
});
