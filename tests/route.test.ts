import { test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "../app/api/event/route";

test("origin validation uses the browser-facing host and keeps cross-site requests blocked", async () => {
  for (const [url, host, origin, allowed] of [
    ["http://0.0.0.0:3000/api/event", "localhost:3000", "http://localhost:3000", true],
    ["http://0.0.0.0:3000/api/event", "127.0.0.1:3000", "http://127.0.0.1:3000", true],
    ["http://0.0.0.0:3000/api/event", "192.168.1.5:3000", "http://192.168.1.5:3000", true],
    ["https://0.0.0.0:3000/api/event", "draw.example.com", "https://draw.example.com", true],
    ["http://localhost:3000/api/event", "localhost:3000", "https://another-site.test", false],
    ["http://localhost:3000/api/event", "localhost:3000", "http://localhost:3001", false],
    ["https://draw.example.com/api/event", "draw.example.com", "http://draw.example.com", false],
    ["http://localhost:3000/api/event", "localhost:3000", "null", false],
  ] as const) {
    const response = await POST(new Request(url, {
      method: "POST",
      headers: { Host: host, Origin: origin, "Content-Type": "application/json" },
      // An unknown action exercises validation without touching the database.
      body: JSON.stringify({ action: "origin-test" }),
    }));
    assert.equal(response.status, allowed ? 400 : 403, `${host} / ${origin}`);
    assert.equal((await response.json()).error, allowed ? "Unknown action" : "Invalid origin");
  }
});
