import { test, expect, Page } from "@playwright/test";
import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
import { type Event as DrawEvent, nextDraw } from "../lib/model";
import { sampleEvent, mockDraw } from "./fixtures";

async function liveSession(page: Page, eventId: string) {
  await page.addInitScript(id => {
    sessionStorage.setItem("nippon-onam-live-event", id);
  }, eventId);
}
async function mockEvent(page: Page, initial = sampleEvent(), initiallyEmpty = false) {
  let hasEvent = !initiallyEmpty;
  const state = { event: initial, draws: [] as string[] };
  await liveSession(page, initial.id);
  await page.route("**/api/event", async route => {
    const body = route.request().postDataJSON();
    if (body.action === "draw") {
      if (!state.draws.includes(body.key)) state.event = mockDraw(state.event, body.branch);
      state.draws.push(body.key);
    }
    if (body.action === "ack") state.event = { ...state.event,
      status: nextDraw(state.event) ? "locked" : "complete",
      results: state.event.results.map(r => ({ ...r, acknowledged: true })),
    };
    if (body.action === "import") state.event = { ...state.event, entries: body.entries, prizes: body.prizes, branch_draw: body.branch_draw };
    if (body.action === "lock") state.event = { ...state.event, status: "locked" };
    if (body.action === "create") { hasEvent = true; state.event = { ...sampleEvent(), status: "draft", entries: [] }; }
    await route.fulfill({ json: { event: hasEvent ? state.event : null } });
  });
  return state;
}
async function finishDraw(page: Page) {
  await page.clock.fastForward(10000);
  await expect(page.locator(".winner-card h2")).toBeVisible();
}
test.beforeEach(async ({ page }, info) => {
  if (!info.title.startsWith("full animation")) {
    await page.clock.install();
    await page.emulateMedia({ reducedMotion: "reduce" });
  }
});

test("shared link opens without sign-in and keeps only the header sound toggle", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("nippon-onam-branch-rehearsal-v2", JSON.stringify({ id: "old-demo", entries: [{ name: "Old demo customer" }] })));
  await page.route("**/api/event", route => {
    expect(route.request().headers().authorization).toBeUndefined();
    return route.fulfill({ json: { event: null } });
  });
  await page.goto("http://localhost:3000");
  await expect(page.getByRole("heading", { name: "Ready for a little luck?" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/rehearsal|Old demo customer|sign in|password|fullscreen/i);
  await expect(page.locator("footer")).toHaveCount(0);
  await expect(page.getByLabel("Presentation quality")).toHaveCount(0);
  await expect(page.locator("audio")).toHaveAttribute("src", "/draw-music.mp3");
  await page.locator("header").getByRole("button", { name: "Enable sound" }).click();
  await expect(page.getByRole("button", { name: "Mute sound" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Mute sound" }).click();
  await expect(page.getByRole("button", { name: "Enable sound" })).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Upload Excel sheet" }).click();
  await expect(page.getByLabel("Participant Excel or CSV")).toBeVisible();
  await expect(page.locator('input[accept="audio/*"]')).toHaveCount(0);
  await expect(page.getByRole("dialog")).not.toContainText(/sign in|password|draw music/i);
});

test("complete branch draws, refresh, replay and combined Excel download", async ({ page }) => {
  const state = await mockEvent(page);
  await page.goto("http://localhost:3000");
  for (const [index, branch] of ["Kayamkulam", "Enjakkal", "Kalamaserry", "Irinjalkuda"].entries()) {
    await page.getByLabel("Select branch", { exact: true }).selectOption(branch);
    for (const rank of ["3rd", "2nd", "1st"]) {
      await page.getByRole("button", { name: `Draw ${rank} prize` }).dblclick();
      await finishDraw(page);
      await expect(page.locator(".coin-entry")).toContainText(branch);
      if (index === 0 && rank === "3rd") {
        const name = await page.locator(".coin-winner").innerText();
        await page.reload();
        await expect(page.locator(".winner-card h2")).toHaveText(name);
        await page.getByRole("button", { name: "Replay reveal" }).click();
        await finishDraw(page);
        await expect(page.locator(".coin-winner")).toHaveText(name);
      }
      await page.getByRole("button", { name: rank === "3rd" ? "Continue to 2nd prize" : rank === "2nd" ? "Continue to 1st prize" : index === 3 ? "Celebrate all winners" : "Choose another branch" }).click();
    }
  }
  expect(state.draws).toHaveLength(12);
  expect(new Set(state.event.results.map(r => r.entry_id)).size).toBe(12);
  await expect(page.locator(".prize")).toHaveCount(12);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download winners sheet" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("onam-winners.xlsx");
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Uint8Array.from(await readFile((await file.path())!)).buffer);
  expect(book.worksheets).toHaveLength(1);
  expect(book.worksheets[0].rowCount).toBe(13);
});

test("normal reveal waits ten seconds across exit and refresh", async ({ page }) => {
  const state = await mockEvent(page);
  await page.goto("http://localhost:3000");
  await page.getByLabel("Select branch", { exact: true }).selectOption("Enjakkal");
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  const response = page.waitForResponse(r => r.url().endsWith("/api/event") && r.request().postDataJSON().action === "draw");
  await page.getByRole("button", { name: "Draw 3rd prize" }).dblclick();
  await response;
  await page.clock.fastForward(5000);
  await page.keyboard.press("Escape");
  await expect(page.locator(".winner-card h2")).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("Select branch", { exact: true })).toBeDisabled();
  await page.clock.fastForward(4999);
  await expect(page.locator(".winner-card h2")).toHaveCount(0);
  await page.clock.fastForward(1);
  await expect(page.locator(".winner-card h2")).toBeVisible();
  expect(state.draws).toHaveLength(1);
});

test("double-clicking the drum reveals the saved winner without another draw", async ({ page }) => {
  const state = await mockEvent(page);
  await page.goto("http://localhost:3000");
  await page.getByLabel("Select branch", { exact: true }).selectOption("Enjakkal");
  await page.waitForSelector("canvas[data-ready=true]");
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.getByRole("button", { name: "Draw 3rd prize" }).click();
  await expect.poll(() => state.event.results.length).toBe(1);
  await page.clock.fastForward(2000);
  await expect(page.locator(".winner-card h2")).toHaveCount(0);
  await page.locator("canvas").dblclick();
  await page.clock.runFor(1);
  await expect(page.locator(".coin-winner")).toBeVisible();
  await expect(page.locator("header").getByRole("button", { name: "Enable sound" })).toBeVisible();
  expect(state.draws).toHaveLength(1);
  await page.getByRole("button", { name: "Replay reveal" }).click();
  await page.getByRole("button", { name: "Reveal now", exact: true }).click();
  await page.clock.runFor(1);
  await expect(page.locator(".coin-winner")).toHaveText(state.event.results[0].name);
  expect(state.draws).toHaveLength(1);
});

for (const skip of [false, true]) test(`delayed confirmation stays hidden ${skip ? "after double-click" : "at ten seconds"}`, async ({ page }) => {
  let event = sampleEvent();
  await liveSession(page, event.id);
  let confirm!: () => void;
  const ready = new Promise<void>(resolve => { confirm = resolve; });
  await page.route("**/api/event", async route => {
    const body = route.request().postDataJSON();
    if (body.action === "draw") { await ready; event = mockDraw(event, body.branch); }
    await route.fulfill({ json: { event } });
  });
  await page.goto("http://localhost:3000");
  await page.getByLabel("Select branch", { exact: true }).selectOption("Enjakkal");
  await page.waitForSelector("canvas[data-ready=true]");
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.getByRole("button", { name: "Draw 3rd prize" }).click();
  if (skip) await page.locator("canvas").dblclick();
  await page.clock.fastForward(skip ? 1 : 10000);
  await expect(page.locator(".draw-label")).toHaveText("Confirming winner…");
  await expect(page.locator(".winner-card h2")).toHaveCount(0);
  confirm(); await page.clock.resume();
  await expect(page.locator(".winner-card h2")).toBeVisible();
});

test("failed requests retain the same idempotency key", async ({ page }) => {
  let event = sampleEvent();
  const keys: string[] = [];
  await liveSession(page, event.id);
  await page.route("**/api/event", async route => {
    const body = route.request().postDataJSON();
    if (body.action === "draw") {
      keys.push(body.key);
      if (keys.length === 1) return route.fulfill({ status: 503, json: { error: "Temporary draw failure" } });
      event = mockDraw(event, body.branch);
    }
    await route.fulfill({ json: { event } });
  });
  await page.goto("http://localhost:3000");
  await page.getByLabel("Select branch", { exact: true }).selectOption("Enjakkal");
  await page.getByRole("button", { name: "Draw 3rd prize" }).click();
  await expect(page.locator(".draw-controls [role=alert]")).toContainText("Temporary draw failure");
  await expect(page.locator(".coin-winner")).toHaveCount(0);
  await page.getByRole("button", { name: "Draw 3rd prize" }).click();
  await finishDraw(page);
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
});

test("first Excel upload creates the shared event, locks it and downloads winners", async ({ page }) => {
  const state = await mockEvent(page, { ...sampleEvent(), status: "draft", entries: [] }, true);
  await page.goto("http://localhost:3000");
  await page.getByRole("button", { name: "Upload Excel sheet" }).click();
  await page.getByLabel("Participant Excel or CSV").setInputFiles("public/participants-example.xlsx");
  await expect(page.getByText("6 eligible entries · 0 errors")).toBeVisible();
  await page.getByRole("button", { name: "Save reviewed entries" }).click();
  await page.getByRole("button", { name: "Lock live event" }).click();
  await page.getByLabel("Select branch", { exact: true }).selectOption("Kochi");
  await page.getByRole("button", { name: "Draw 3rd prize" }).click();
  await finishDraw(page);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download winners sheet" }).click();
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Uint8Array.from(await readFile((await (await download).path())!)).buffer);
  expect(book.worksheets[0].getCell("A2").text).toBe("Kochi");
  expect(book.worksheets[0].getCell("G2").text).toBe("0123456789");
  expect(state.event.status).toBe("locked");
});

for (const [width, height] of [[1440,900], [1280,720], [661,606], [390,844], [375,667], [900,480]]) {
  test(`winner details and controls do not overlap at ${width}x${height}`, async ({ page }) => {
    const event = sampleEvent();
    event.entries = event.entries.map(e => ({ ...e, name: width === 375 ? "A very long customer name that needs several lines on a small screen" : "Shaji", mobile: "0123456789" }));
    await mockEvent(page, event);
    await page.setViewportSize({ width, height });
    await page.goto("http://localhost:3000");
    await page.getByLabel("Select branch", { exact: true }).selectOption("Irinjalkuda");
    await page.getByRole("button", { name: "Draw 3rd prize" }).click();
    await finishDraw(page);
    const result = (await page.locator(".coin-result").boundingBox())!;
    const controls = (await page.locator(".draw-controls").boundingBox())!;
    expect(result.y + result.height + 10).toBeLessThanOrEqual(controls.y);
    expect(result.x).toBeGreaterThanOrEqual(0);
    expect(result.x + result.width).toBeLessThanOrEqual(width);
    await page.getByRole("button", { name: "Continue to 2nd prize" }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/winner-${width}x${height}.png` });
    await page.getByRole("button", { name: "Continue to 2nd prize" }).click();
    await expect(page.getByRole("button", { name: "Draw 2nd prize" })).toBeEnabled();
    await expect(page.locator("body")).not.toContainText(/rehearsal/i);
  });
}

test("full animation and graphics fallback preserve the winner", async ({ page }) => {
  // A short WAV response checks actual media playback without shipping test audio.
  const wav = Buffer.alloc(8044);
  wav.write("RIFF", 0); wav.writeUInt32LE(8036, 4); wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(8000, 28); wav.writeUInt16LE(1, 32);
  wav.writeUInt16LE(8, 34); wav.write("data", 36); wav.writeUInt32LE(8000, 40); wav.fill(128, 44);
  await page.route("**/draw-music.mp3", route => route.fulfill({ contentType: "audio/wav", body: wav }));
  await mockEvent(page);
  await page.goto("http://localhost:3000");
  await page.getByLabel("Select branch", { exact: true }).selectOption("Enjakkal");
  await page.waitForSelector("canvas[data-ready=true]");
  await expect.poll(() => page.locator("audio").evaluate(audio => (audio as HTMLAudioElement).readyState)).toBeGreaterThanOrEqual(2);
  await page.getByRole("button", { name: "Enable sound" }).click();
  const started = Date.now();
  await page.getByRole("button", { name: "Draw 3rd prize" }).click();
  await expect.poll(() => page.locator("audio").evaluate(audio => !(audio as HTMLAudioElement).paused)).toBe(true);
  await page.getByRole("button", { name: "Mute sound" }).click();
  await expect.poll(() => page.locator("audio").evaluate(audio => (audio as HTMLAudioElement).paused)).toBe(true);
  await page.getByRole("button", { name: "Enable sound" }).click();
  await expect.poll(() => page.locator("audio").evaluate(audio => !(audio as HTMLAudioElement).paused)).toBe(true);
  await expect(page.locator(".coin-winner")).toBeVisible({ timeout: 30000 });
  expect(Date.now() - started).toBeGreaterThanOrEqual(10000);
  await page.screenshot({ path: "test-results/winner-animated.png" });
  await page.getByRole("button", { name: "Continue to 2nd prize" }).click();
  await page.locator("canvas[data-ready=true]").evaluate(canvas => canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true })));
  await expect(page.getByText("Graphics unavailable. Saved winners can still be revealed below.")).toBeVisible();
  await page.getByRole("button", { name: "Draw 2nd prize" }).click();
  await page.getByRole("button", { name: "Reveal now", exact: true }).click();
  await expect(page.locator(".winner-card h2")).toBeVisible();
});
