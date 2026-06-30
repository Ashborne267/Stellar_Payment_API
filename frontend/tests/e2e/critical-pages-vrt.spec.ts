import { expect, test, type Page } from "@playwright/test";

const PAYMENT_ID = "f4e8deaa-8a11-47b3-9b27-a95fa38374f4";
const MERCHANT_API_KEY = "sk_test_visual_regression_key";

const dashboardMetrics = {
  data: [
    { date: "2026-03-20", volume: 1250.42, count: 8 },
    { date: "2026-03-21", volume: 820.1, count: 5 },
    { date: "2026-03-22", volume: 1540.75, count: 11 },
    { date: "2026-03-23", volume: 960.3, count: 6 },
    { date: "2026-03-24", volume: 2110.88, count: 12 },
    { date: "2026-03-25", volume: 1785.64, count: 9 },
    { date: "2026-03-26", volume: 2460.91, count: 14 },
  ],
  total_volume: 10929,
  total_payments: 65,
  confirmed_count: 59,
  success_rate: 90.8,
};

const volumeMetrics = {
  range: "7D",
  assets: [],
  data: [],
};

const recentPayments = {
  payments: [
    {
      id: "pay_1001",
      amount: "125.50",
      asset: "USDC",
      recipient: "GRECIPIENT1001111111111111111111111111111111111111111111",
      status: "confirmed",
      description: "Pro subscription",
      created_at: "2026-03-26T09:15:00.000Z",
    },
    {
      id: "pay_1002",
      amount: "49.99",
      asset: "XLM",
      recipient: "GRECIPIENT1002222222222222222222222222222222222222222222",
      status: "pending",
      description: "Starter plan",
      created_at: "2026-03-25T13:40:00.000Z",
    },
    {
      id: "pay_1003",
      amount: "250.00",
      asset: "USDC",
      recipient: "GRECIPIENT1003333333333333333333333333333333333333333333",
      status: "confirmed",
      description: "Agency invoice",
      created_at: "2026-03-24T16:05:00.000Z",
    },
  ],
  total_count: 3,
};

async function mockDashboardApis(page: Page) {
  await page.route("**/api/metrics/7day", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(dashboardMetrics),
    });
  });

  await page.route("**/api/metrics/volume?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(volumeMetrics),
    });
  });

  await page.route("**/api/payments?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(recentPayments),
    });
  });
}

async function mockSettingsApis(page: Page) {
  await page.route("**/api/merchant-branding", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        branding_config: {
          primary_color: "#5ef2c0",
          secondary_color: "#b8ffe2",
          background_color: "#050608",
        },
      }),
    });
  });

  await page.route("**/api/webhook-settings", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        webhook_url: "https://example.com/webhooks/stellar",
        webhook_secret_masked: "whsec_1234********5678",
      }),
    });
  });
}

async function mockCheckoutApi(page: Page) {
  await page.route("**/api/payment-status/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        payment: {
          id: PAYMENT_ID,
          amount: 100,
          asset: "XLM",
          asset_issuer: null,
          recipient: "GRECIPIENTADDRESS",
          description: "Test payment for visual regression",
          memo: "ORDER-1007",
          memo_type: "text",
          status: "pending",
          tx_id: null,
          created_at: "2026-03-26T12:00:00.000Z",
          branding_config: {
            primary_color: "#5ef2c0",
            secondary_color: "#ffffff",
            background_color: "#0f0f0f",
          },
        },
      }),
    });
  });
}

async function mockHealthApi(page: Page) {
  await page.route("**/api/health", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "ok",
      }),
    });
  });
}

async function seedMerchantSession(page: Page) {
  await page.addInitScript(
    ({ apiKey }) => {
      window.localStorage.setItem("merchant_api_key", apiKey);
      document.cookie = "NEXT_LOCALE=en; path=/";
    },
    { apiKey: MERCHANT_API_KEY },
  );
}

test.describe("Visual Regression Tests - Critical Dashboard Paths", () => {
  test.beforeEach(async ({ page }) => {
    await seedMerchantSession(page);
    await mockHealthApi(page);
  });

  test("Dashboard Home matches visual baseline", async ({ page }) => {
    await mockDashboardApis(page);

    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Merchant Overview" })).toBeVisible();
    await expect(page.getByText("Pro subscription")).toBeVisible();
    await page.waitForTimeout(1200);

    await expect(page).toHaveScreenshot("dashboard-home.png", {
      fullPage: true,
    });
  });

  test("Checkout matches visual baseline", async ({ page }) => {
    await mockCheckoutApi(page);

    await page.goto(`/pay/${PAYMENT_ID}`);
    await expect(page.getByRole("heading", { name: "Complete Payment" })).toBeVisible();
    await expect(page.getByText("Test payment for visual regression")).toBeVisible();

    await expect(page).toHaveScreenshot("checkout-page.png", {
      fullPage: true,
    });
  });

  test("Settings matches visual baseline", async ({ page }) => {
    await mockSettingsApis(page);

    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Merchant Settings" })).toBeVisible();
    await page.getByRole("button", { name: "Branding" }).click();
    await expect(page.getByText("Sample checkout card")).toBeVisible();

    await expect(page).toHaveScreenshot("settings-page.png", {
      fullPage: true,
    });
  });
});
