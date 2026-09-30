import { chromium } from "playwright";

const base = process.env.UI_BASE_URL || "http://127.0.0.1:8787";
const email = process.env.ADMIN_EMAIL || "admin@pickle.test";
const password = process.env.ADMIN_PASSWORD || "cloudflare-test-password-123";
const browser = await chromium.launch({ headless: true });

async function login(page) {
  await page.goto(base + "/login", { waitUntil: "domcontentloaded" });
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator('#loginForm button[type="submit"]').click();
  await page.waitForFunction(() => /\/admin(?:\.html)?$/.test(location.pathname));
  await page.locator('[data-page="players"]').click();
  await page.locator('[data-player-row]').first().waitFor({ state: "visible" });
}

try {
  const permanentPage = await browser.newPage();
  await permanentPage.route("**/assets/admin-crud.js*", route => route.abort());
  await login(permanentPage);
  if (!(await permanentPage.locator("th", { hasText: "Thao tác" }).count())) {
    throw new Error("PLAYER_ACTION_HEADER_MISSING");
  }
  if (!(await permanentPage.locator("[data-crud-edit-player]").count())) {
    throw new Error("PERMANENT_PLAYER_EDIT_BUTTON_MISSING");
  }

  const modalPage = await browser.newPage();
  await login(modalPage);
  await modalPage.locator("[data-crud-edit-player]").first().click();
  await modalPage.locator("#crudPName").waitFor({ state: "visible" });
  if (!(await modalPage.locator("#crudPRating").count())) throw new Error("PLAYER_RATING_FIELD_MISSING");
  if (!(await modalPage.locator("#crudPRatingReason").count())) throw new Error("PLAYER_RATING_REASON_MISSING");

  console.log("PLAYER_EDIT_UI_OK");
} finally {
  await browser.close();
}
