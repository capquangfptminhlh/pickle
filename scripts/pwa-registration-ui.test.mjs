import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { chromium } from "playwright";

test("PWA bootstrap tolerates a blocked service-worker registration", async () => {
  const source = await readFile(new URL("../assets/pwa.js", import.meta.url), "utf8");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  try {
    await page.setContent('<nav class="top-actions"></nav>');
    await page.evaluate(() => {
      Object.defineProperty(navigator, "serviceWorker", {
        configurable: true,
        value: {
          addEventListener() {},
          controller: null,
          register: async () => undefined,
        },
      });
    });
    await page.addScriptTag({ content: source });
    await page.waitForTimeout(50);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
