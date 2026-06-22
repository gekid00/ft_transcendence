import { test, expect } from "@playwright/test";

test.describe("Landing page", () => {
  test("loads and displays main content", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/transcendence|connect.*4|puissance/i);
    const body = await page.textContent("body");
    expect(body?.length).toBeGreaterThan(100);
  });

  test("has no console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await page.goto("/");
    await page.waitForTimeout(2000);
    expect(errors).toEqual([]);
  });

  test("navigation links are present", async ({ page }) => {
    await page.goto("/");
    const links = await page.locator("a").count();
    expect(links).toBeGreaterThan(0);
  });
});

test.describe("About page", () => {
  test("loads and displays content", async ({ page }) => {
    await page.goto("/about");
    const body = await page.textContent("body");
    expect(body?.length).toBeGreaterThan(50);
  });

  test("has no console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await page.goto("/about");
    await page.waitForTimeout(2000);
    expect(errors).toEqual([]);
  });
});

test.describe("How to Play page", () => {
  test("loads and displays content", async ({ page }) => {
    await page.goto("/how-to-play");
    const body = await page.textContent("body");
    expect(body?.length).toBeGreaterThan(50);
  });

  test("has no console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await page.goto("/how-to-play");
    await page.waitForTimeout(2000);
    expect(errors).toEqual([]);
  });
});

test.describe("Privacy page", () => {
  test("loads and displays content", async ({ page }) => {
    await page.goto("/privacy");
    const body = await page.textContent("body");
    expect(body?.length).toBeGreaterThan(50);
  });
});

test.describe("Terms page", () => {
  test("loads and displays content", async ({ page }) => {
    await page.goto("/terms");
    const body = await page.textContent("body");
    expect(body?.length).toBeGreaterThan(50);
  });
});

test.describe("Login page", () => {
  test("loads and displays login form", async ({ page }) => {
    await page.goto("/login");
    const body = await page.textContent("body");
    expect(body?.length).toBeGreaterThan(50);
  });
});

test.describe("Signup page", () => {
  test("loads and displays signup form", async ({ page }) => {
    await page.goto("/signup");
    const body = await page.textContent("body");
    expect(body?.length).toBeGreaterThan(50);
  });
});

test.describe("Styleguide page", () => {
  test("loads and displays styleguide", async ({ page }) => {
    await page.goto("/styleguide");
    const body = await page.textContent("body");
    expect(body?.length).toBeGreaterThan(50);
  });
});

test.describe("Responsive design", () => {
  test("landing page renders on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    const body = await page.textContent("body");
    expect(body?.length).toBeGreaterThan(100);
  });

  test("landing page renders on tablet viewport", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/");
    const body = await page.textContent("body");
    expect(body?.length).toBeGreaterThan(100);
  });
});
