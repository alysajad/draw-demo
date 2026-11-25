import { test, expect, Page } from "@playwright/test";
import ExcelJS from "exceljs";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { type Event as DrawEvent, branches, nextDraw, NIPPON_BRANCHES } from "../lib/model";
import { sampleEvent, mockDraw, sampleWorkbook } from "./fixtures";
import { drawAudio } from "../lib/draw-animation";

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
    if (body.action === "import") state.event = { ...state.event, entries: body.entries, prizes: body.prizes, branch_draw: body.branch_draw, status: body.finalize ? "locked" : "draft" };
    if (body.action === "lock") state.event = { ...state.event, status: "locked" };
    if (body.action === "create") { hasEvent = true; state.event = { ...sampleEvent(), status: "draft", entries: [] }; }
    await route.fulfill({ json: { event: hasEvent ? state.event : null } });
  });
  return state;
}
async function finishDraw(page: Page) {
  await expect(page.getByRole("button", { name: "Reveal now", exact: true })).toBeVisible();
  await page.clock.fastForward(10000);
  await expect(page.locator(".coin-winner, .winner-card.paper-fallback h2").first()).toBeVisible();
}
test.beforeEach(async ({ page }, info) => {
  if (info.title.startsWith("complete branch draws")) {
    await page.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      Object.defineProperty(HTMLCanvasElement.prototype, "getContext", { value: function (this: HTMLCanvasElement, type: string, options?: unknown) {
        return type.startsWith("webgl") ? null : getContext.call(this, type, options);
      } });
    });
  }
  if (!info.title.startsWith("full animation") && !info.title.startsWith("audio")) {
    await page.route("**/draw-music.mp3", route => route.abort());
    await page.clock.install();
    await page.emulateMedia({ reducedMotion: "reduce" });
  }
});

test("shared link opens without sign-in and keeps only the header sound toggle", async ({ page }) => {
  const musicRequests: string[] = [];
  page.on("request", request => { if (request.url().endsWith("/draw-music.mp3")) musicRequests.push(request.url()); });
  await page.addInitScript(() => sessionStorage.setItem("nippon-onam-branch-rehearsal-v2", JSON.stringify({ id: "old-demo", entries: [{ name: "Old demo customer" }] })));
  await page.route("**/api/event", route => {
    expect(route.request().headers().authorization).toBeUndefined();
    return route.fulfill({ json: { event: null } });
  });
  await page.goto("http://localhost:3000");
  await expect(page.getByRole("region", { name: "Lucky draw ceremony" })).toBeVisible();
  await expect(page.locator("canvas[data-ready=true]")).toBeVisible();
  await expect(page.getByRole("button", { name: "Draw 3rd prize" })).toBeDisabled();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Upload Excel sheet" })).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(/rehearsal|Old demo customer|sign in|password|fullscreen/i);
  await expect(page.locator("footer")).toHaveCount(0);
  await expect(page.getByLabel("Presentation quality")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sound unavailable" })).toBeDisabled();
  if (existsSync("public/draw-music.mp3")) {
    await expect(page.locator("audio")).toHaveAttribute("src", "/draw-music.mp3");
  } else {
    await expect(page.locator("audio")).toHaveCount(0);
    expect(musicRequests).toHaveLength(0);
  }
  await page.getByRole("button", { name: "Open settings" }).click();
  await expect(page.getByLabel("Participant Excel or CSV")).toBeVisible();
  await expect(page.locator('input[accept="audio/*"]')).toHaveCount(0);
  await expect(page.getByRole("dialog")).not.toContainText(/sign in|password|draw music|prize description|Save reviewed entries|Lock live event/i);
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

test("thirteen branches show saved winners and draw status, with all 39 winners in Excel", async ({ page }) => {
  let event = sampleEvent();
  event.entries = Array.from({ length: 13 }, (_, index) => [1, 2, 3].map(number => ({
    entry_id: `${index + 1}-${number}`, name: `Customer ${index + 1}-${number}`, showroom: NIPPON_BRANCHES[index],
  }))).flat();
  const drawAndAcknowledge = (current: DrawEvent, branch: string) => {
    const drawn = mockDraw(current, branch);
    return { ...drawn, results: drawn.results.map(result => ({ ...result, acknowledged: true })) };
  };
  for (let i = 0; i < 3; i++) event = drawAndAcknowledge(event, "Enjakkal");
  event = drawAndAcknowledge(event, "Irinjalakuda");
  const state = await mockEvent(page, event);
  await page.goto("http://localhost:3000");
  const selector = page.getByLabel("Select branch", { exact: true });
  await expect(selector.locator("option")).toHaveCount(14);
  await expect(selector.locator('option[value="Enjakkal"]')).toHaveText("Enjakkal — Already drawn · 3/3");
  await expect(selector.locator('option[value="Irinjalakuda"]')).toHaveText("Irinjalakuda — 1/3 drawn");
  await expect(selector.locator('option[value="Trichur"]')).toHaveText("Trichur — Not drawn · 0/3");
  await expect(page.getByLabel("Branch progress")).toContainText("1 of 13 branches drawn · 4 of 39 winners revealed");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await selector.selectOption("Enjakkal");
    await expect(page.getByRole("heading", { name: "Already drawn", exact: true })).toBeVisible();
    await expect(page.getByLabel("Lucky draw ceremony")).toBeHidden();
    await expect(page.getByRole("button", { name: /^Draw .* prize$/ })).toHaveCount(0);
    const winners = state.event.results.filter(r => r.showroom === "Enjakkal").sort((a, b) => a.rank - b.rank);
    await expect(page.locator(".prize h3")).toHaveText(winners.map(r => r.name));
    await expect(page.locator(".prize-label")).toHaveText(["Enjakkal · 1st PRIZE", "Enjakkal · 2nd PRIZE", "Enjakkal · 3rd PRIZE"]);
    await page.screenshot({ path: `test-results/branch-drawn-${width}.png` });
    await page.reload();
  }
  await selector.selectOption("Enjakkal");
  await expect(page.getByRole("heading", { name: "Already drawn", exact: true })).toBeVisible();
  await selector.selectOption("Irinjalakuda");
  await expect(page.getByRole("button", { name: "Draw 2nd prize" })).toBeEnabled();
  await expect(page.locator(".prize h3").first()).toHaveText(state.event.results.find(r => r.showroom === "Irinjalakuda")!.name);
  await selector.selectOption("Trichur");
  await expect(page.getByRole("button", { name: "Draw 3rd prize" })).toBeEnabled();
  expect(state.draws).toHaveLength(0);

  for (const branch of branches(state.event)) {
    while (nextDraw(state.event, branch)) state.event = drawAndAcknowledge(state.event, branch);
  }
  state.event.status = "complete";
  await page.reload();
  await expect(page.locator(".prize")).toHaveCount(39);
  await selector.selectOption("Trichur");
  await expect(page.getByRole("heading", { name: "Already drawn", exact: true })).toBeVisible();
  await expect(page.locator(".prize")).toHaveCount(3);
  await expect(page.getByLabel("Branch progress")).toContainText("13 of 13 branches drawn · 39 of 39 winners revealed");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download winners sheet" }).click();
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Uint8Array.from(await readFile((await (await download).path())!)).buffer);
  const sheet = book.worksheets[0];
  expect(sheet.rowCount).toBe(40);
  expect([sheet.getCell("A1").text, sheet.getCell("B1").text, sheet.getCell("E1").text]).toEqual(["Branch", "Prize Rank", "Name"]);
  for (const [index, branch] of branches(state.event).entries()) {
    for (const rank of [1, 2, 3]) {
      const row = sheet.getRow(1 + index * 3 + rank);
      expect(row.getCell(1).text).toBe(branch);
      expect(row.getCell(2).text).toBe(["1st", "2nd", "3rd"][rank - 1]);
      expect(row.getCell(5).text).toBe(state.event.results.find(r => r.showroom === branch && r.rank === rank)!.name);
    }
  }
  await selector.selectOption("");
  await expect(page.locator(".prize")).toHaveCount(39);
});

test("normal reveal waits ten seconds across exit and refresh", async ({ page }) => {
  const state = await mockEvent(page);
  await page.goto("http://localhost:3000");
  await page.getByLabel("Select branch", { exact: true }).selectOption("Enjakkal");
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 10000));
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
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 10000));
  await page.getByRole("button", { name: "Draw 3rd prize" }).click();
  await expect.poll(() => state.event.results.length).toBe(1);
  await page.clock.fastForward(2000);
  await expect(page.locator(".winner-card h2")).toHaveCount(0);
  await page.locator("canvas").dblclick();
  await page.clock.runFor(1);
  await expect(page.locator(".coin-winner")).toBeVisible();
  await expect(page.locator("header .sound-toggle")).toBeVisible();
  expect(state.draws).toHaveLength(1);
  await page.getByRole("button", { name: "Replay reveal" }).click();
  await page.getByRole("button", { name: "Reveal now", exact: true }).click();
  await page.clock.runFor(1);
  await expect(page.locator(".coin-winner")).toHaveText(state.event.results[0].name);
  expect(state.draws).toHaveLength(1);
});

for (const skip of [false, true]) test(`draw waits for saved confirmation before starting ${skip ? "despite double-click" : "after a network delay"}`, async ({ page }) => {
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
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 10000));
  await page.getByRole("button", { name: "Draw 3rd prize" }).click();
  if (skip) await page.locator("canvas").dblclick();
  await page.clock.fastForward(skip ? 1 : 10000);
  await expect(page.locator(".draw-label")).toHaveText("Preparing draw…");
  await expect(page.locator(".winner-card h2")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Saving the winner…" })).toBeDisabled();
  await expect(page.locator("main")).toHaveClass(/immersive/);
  await expect(page.getByRole("button", { name: "Saving the winner…" }).locator(".loading-indicator")).toBeVisible();
  confirm(); await page.clock.resume();
  await finishDraw(page);
});

test("idle tabs make no periodic requests and refresh when another tab changes the event", async ({ page }) => {
  const state = await mockEvent(page);
  let reads = 0;
  page.on("request", request => {
    if (request.url().endsWith("/api/event") && request.postDataJSON().action === "state") reads++;
  });
  await page.goto("http://localhost:3000");
  await expect(page.getByLabel("Select branch", { exact: true })).toBeVisible();
  const initialReads = reads;
  await page.clock.fastForward(90000);
  expect(reads).toBe(initialReads);
  state.event = mockDraw(state.event, "Enjakkal");
  state.event.results[0].acknowledged = true;
  await page.evaluate(id => {
    const channel = new BroadcastChannel("nippon-draw-updates");
    channel.postMessage(id);
    channel.close();
  }, state.event.id);
  await expect(page.getByLabel("Select branch", { exact: true }).locator('option[value="Enjakkal"]')).toHaveText("Enjakkal — 1/3 drawn");
  expect(reads).toBe(initialReads + 1);
  await page.clock.fastForward(90000);
  expect(reads).toBe(initialReads + 1);
  expect(state.draws).toHaveLength(0);
});

test("an old background response cannot overwrite a newer draw", async ({ page }) => {
  const state = await mockEvent(page);
  await page.goto("http://localhost:3000");
  await page.getByLabel("Select branch", { exact: true }).selectOption("Enjakkal");
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const stale = structuredClone(state.event);
  let reads = 0;
  await page.route("**/api/event", async route => {
    if (route.request().postDataJSON().action !== "state") return route.fallback();
    reads++;
    await held;
    await route.fulfill({ json: { event: stale } });
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => reads).toBe(1);
  await page.evaluate(() => { window.dispatchEvent(new Event("focus")); window.dispatchEvent(new Event("online")); });
  expect(reads).toBe(1);
  await page.getByRole("button", { name: "Draw 3rd prize" }).click();
  await finishDraw(page);
  const name = state.event.results[0].name;
  const returned = page.waitForResponse(response => response.url().endsWith("/api/event") && response.request().postDataJSON().action === "state");
  release(); await returned;
  await expect(page.locator(".coin-winner")).toHaveText(name);
  await page.getByRole("button", { name: "Continue to 2nd prize" }).click();
  await expect(page.getByRole("button", { name: "Draw 2nd prize" })).toBeEnabled();
  expect(state.draws).toHaveLength(1);
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

test("Settings blocks invalid sheets and allows retrying a failed upload", async ({ page }) => {
  const state = await mockEvent(page, { ...sampleEvent(), status: "draft", entries: [] }, true);
  let failImport = true;
  await page.route("**/api/event", route => {
    if (route.request().postDataJSON().action === "import" && failImport) {
      failImport = false;
      return route.fulfill({ status: 503, json: { error: "Please retry the upload." } });
    }
    return route.fallback();
  });
  await page.goto("http://localhost:3000");
  await page.getByRole("button", { name: "Open settings" }).click();
  const input = page.getByLabel("Participant Excel or CSV");
  await input.setInputFiles({ name: "invalid.csv", mimeType: "text/csv", buffer: Buffer.from("entry_id,name,showroom\n1,A,Kochi") });
  await expect(page.getByRole("button", { name: "Upload sheet", exact: true })).toBeDisabled();
  expect(state.event.entries).toHaveLength(0);
  await input.setInputFiles({ name: "participants.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: await sampleWorkbook() });
  await page.getByRole("button", { name: "Upload sheet", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toHaveText("Please retry the upload.");
  await expect(page.getByText("43 eligible entries · 0 errors")).toBeVisible();
  await page.getByRole("button", { name: "Upload sheet", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(state.event.status).toBe("locked");
});

test("Excel upload in Settings prepares the draw in one step and downloads winners", async ({ page }) => {
  const state = await mockEvent(page, { ...sampleEvent(), status: "draft", entries: [] }, true);
  await page.goto("http://localhost:3000");
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByLabel("Participant Excel or CSV").setInputFiles({ name: "participants.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: await sampleWorkbook() });
  await expect(page.getByText("43 eligible entries · 0 errors")).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("combobox")).toHaveCount(0);
  await expect(page.getByText("4 of 13 branches have participants.")).toBeVisible();
  await expect(page.getByText(/No participants for:/)).toContainText("Trichur");
  await page.getByRole("button", { name: "Upload sheet", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(state.event.status).toBe("locked");
  const selector = page.getByLabel("Select branch", { exact: true });
  await expect(selector.locator("option")).toHaveCount(14);
  await expect(selector.locator('option[value="Trichur"]')).toHaveText("Trichur — No participants");
  await expect(selector.locator('option[value="Trichur"]')).toHaveJSProperty("disabled", true);
  await expect(selector.locator('option[value="Irinjalakuda"]')).toHaveText("Irinjalakuda — Not drawn · 0/3");
  await page.getByLabel("Select branch", { exact: true }).selectOption("Enjakkal");
  await page.getByRole("button", { name: "Draw 3rd prize" }).click();
  await finishDraw(page);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download winners sheet" }).click();
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Uint8Array.from(await readFile((await (await download).path())!)).buffer);
  expect(book.worksheets[0].getCell("A2").text).toBe("Enjakkal");
  expect(book.worksheets[0].getCell("G2").text).toBe(state.event.results[0].mobile);
  expect(state.event.status).toBe("locked");
});

test("upload shows progress until all entries are saved together", async ({ page }) => {
  const state = await mockEvent(page, { ...sampleEvent(), status: "draft", entries: [] });
  let finish!: () => void;
  const saving = new Promise<void>(resolve => { finish = resolve; });
  const actions: string[] = [];
  await page.route("**/api/event", async route => {
    const body = route.request().postDataJSON();
    actions.push(body.action);
    if (body.action === "import") { expect(body.finalize).toBe(true); await saving; }
    await route.fallback();
  });
  await page.goto("http://localhost:3000");
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByLabel("Participant Excel or CSV").setInputFiles({ name: "participants.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: await sampleWorkbook() });
  await page.getByRole("button", { name: "Upload sheet", exact: true }).click();
  await expect(page.getByRole("progressbar", { name: "Participant upload progress" })).toBeVisible();
  await expect(page.locator(".upload-progress")).toContainText("43 entries");
  await expect(page.getByRole("button", { name: "Uploading…" })).toBeDisabled();
  expect(state.event.entries).toHaveLength(0);
  finish();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(state.event.entries).toHaveLength(43);
  expect(state.event.status).toBe("locked");
  expect(actions.filter(action => action === "import")).toHaveLength(1);
  expect(actions).not.toContain("lock");
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

function silentWav(seconds: number) {
  const length = 8000 * seconds;
  const wav = Buffer.alloc(44 + length);
  wav.write("RIFF", 0); wav.writeUInt32LE(36 + length, 4); wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(8000, 28); wav.writeUInt16LE(1, 32);
  wav.writeUInt16LE(8, 34); wav.write("data", 36); wav.writeUInt32LE(length, 40); wav.fill(128, 44);
  return wav;
}

test("full animation and graphics fallback preserve the winner", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 480 });
  await mockEvent(page);
  await page.goto("http://localhost:3000");
  await page.getByLabel("Select branch", { exact: true }).selectOption("Enjakkal");
  await page.waitForSelector("canvas[data-ready=true]");
  await expect.poll(() => page.locator("audio").evaluate(node => (node as HTMLAudioElement).readyState), { timeout: 15000 }).toBeGreaterThanOrEqual(2);
  const duration = await page.locator("audio").evaluate(node => (node as HTMLAudioElement).duration);
  await page.evaluate(() => {
    const player = document.querySelector("audio")!;
    const observer = new MutationObserver(() => {
      if (document.querySelector(".coin-winner")) {
        player.dataset.revealTime = String(player.currentTime);
        player.dataset.revealPaused = String(player.paused);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
  const started = Date.now();
  await page.getByRole("button", { name: "Draw 3rd prize" }).click();
  await expect.poll(() => page.locator("audio").evaluate(audio => !(audio as HTMLAudioElement).paused)).toBe(true);
  await expect(page.locator(".coin-winner")).toBeVisible({ timeout: 30000 });
  expect(Date.now() - started).toBeGreaterThanOrEqual(drawAudio.revealAt / drawAudio.playbackRate * 1000);
  const revealedAt = Number(await page.locator("audio").getAttribute("data-reveal-time"));
  expect(revealedAt).toBeGreaterThanOrEqual(drawAudio.revealAt);
  expect(revealedAt).toBeLessThan(drawAudio.revealAt + .35);
  await expect(page.locator("audio")).toHaveAttribute("data-reveal-paused", "false");
  await expect.poll(() => page.locator("audio").evaluate(node => (node as HTMLAudioElement).playbackRate)).toBe(.75);
  expect(revealedAt).toBeLessThan(duration);
  await expect(page.locator(".coin-editorial")).toHaveCount(0);
  await page.screenshot({ path: "test-results/winner-animated.png" });
  await page.getByRole("button", { name: "Continue to 2nd prize" }).click();
  await expect.poll(() => page.locator("audio").evaluate(node => (node as HTMLAudioElement).paused)).toBe(true);
  await page.locator("canvas[data-ready=true]").evaluate(canvas => canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true })));
  await expect(page.getByText("Graphics unavailable. Saved winners can still be revealed below.")).toBeVisible();
  await page.getByRole("button", { name: "Draw 2nd prize" }).click();
  await page.getByRole("button", { name: "Reveal now", exact: true }).click();
  await expect.poll(() => page.locator("audio").evaluate(node => (node as HTMLAudioElement).currentTime)).toBeGreaterThanOrEqual(drawAudio.revealAt - drawAudio.leadIn * drawAudio.playbackRate - .1);
  await expect(page.locator(".winner-card h2")).toBeVisible();
  await expect.poll(() => page.locator("audio").evaluate(audio => (audio as HTMLAudioElement).paused)).toBe(false);
  await expect.poll(() => page.locator("audio").evaluate(audio => (audio as HTMLAudioElement).ended), { timeout: 10000 }).toBe(true);
});

test("audio cue controls the reveal even after playback stalls, and replay starts again without another draw", async ({ page }) => {
  // Audio timing is exercised independently of expensive software WebGL rendering.
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", { value: function (this: HTMLCanvasElement, type: string, options?: unknown) {
      return type.startsWith("webgl") ? null : getContext.call(this, type, options);
    } });
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/draw-music.mp3", route => route.fulfill({ contentType: "audio/wav", body: silentWav(2) }));
  const state = await mockEvent(page);
  await page.goto("http://localhost:3000");
  await page.getByLabel("Select branch", { exact: true }).selectOption("Enjakkal");
  const audio = page.locator("audio");
  await audio.evaluate(node => {
    const player = node as HTMLAudioElement;
    const play = player.play.bind(player);
    let pauseFirstPlayback = true;
    player.play = () => {
      const playing = play();
      if (pauseFirstPlayback) {
        pauseFirstPlayback = false;
        void playing.then(() => player.pause());
      }
      return playing;
    };
  });
  await page.getByRole("button", { name: "Draw 3rd prize" }).click();
  // Two source seconds take 2.67 seconds at 0.75×; a stall must delay the cue.
  await page.waitForTimeout(3000);
  await expect(page.locator(".winner-card h2")).toHaveCount(0);
  await page.getByRole("button", { name: "Mute sound" }).click();
  await expect.poll(() => audio.evaluate(node => (node as HTMLAudioElement).muted)).toBe(true);
  await page.getByRole("button", { name: "Enable sound" }).click();
  await expect.poll(() => audio.evaluate(node => (node as HTMLAudioElement).muted)).toBe(false);
  await audio.evaluate(node => (node as HTMLAudioElement).play());
  await expect(page.locator(".winner-card h2")).toBeVisible();
  await expect.poll(() => audio.evaluate(node => (node as HTMLAudioElement).ended)).toBe(true);
  expect(state.draws).toHaveLength(1);
  await page.getByRole("button", { name: "Replay reveal" }).click();
  await expect(page.locator(".winner-card h2")).toHaveCount(0);
  await expect.poll(() => audio.evaluate(node => (node as HTMLAudioElement).currentTime)).toBeLessThan(1);
  await page.getByRole("button", { name: "Reveal now", exact: true }).click();
  await expect(page.locator(".winner-card h2")).toHaveCount(0);
  await expect.poll(() => audio.evaluate(node => (node as HTMLAudioElement).currentTime)).toBeGreaterThanOrEqual(1.1);
  await expect(page.locator(".winner-card h2")).toHaveText(state.event.results[0].name);
  await expect.poll(() => audio.evaluate(node => (node as HTMLAudioElement).ended)).toBe(true);
  await expect.poll(() => audio.evaluate(node => (node as HTMLAudioElement).paused)).toBe(true);
  expect(state.draws).toHaveLength(1);
});
