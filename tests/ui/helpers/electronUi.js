import path from "node:path";
import { _electron as electron, expect } from "@playwright/test";

export async function launchUiValidationApp() {
  const appPath = path.join(process.cwd(), "electron-ui", "main.bundled.cjs");
  const { ELECTRON_RUN_AS_NODE, ...env } = process.env;
  const app = await electron.launch({
    args: [appPath],
    env: {
      ...env,
      NODE_ENV: "development",
    },
  });
  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  await expect(window.getByRole("heading", { name: "Dashboard" })).toBeVisible({
    timeout: 20000,
  });
  return { app, window };
}

export async function closeUiValidationApp(app) {
  if (app) {
    try {
      await app.close();
    } catch {}
  }
}

export async function takeScreenshot(window, name) {
  try {
    await window.screenshot({
      path: `test-results/ui-${name}.png`,
      fullPage: true,
    });
  } catch {}
}

export async function getStyleSnapshot(window) {
  return await window.evaluate(() => {
    const styles = getComputedStyle(document.body);
    return {
      backgroundColor: styles.backgroundColor,
      color: styles.color,
      fontFamily: styles.fontFamily,
    };
  });
}

export async function isCenterPointClickable(window, locator) {
  try {
    const box = await locator.boundingBox();
    if (!box) return false;
    return await window.evaluate(
      () => {
        const el = document.elementFromPoint(arguments[0].x, arguments[0].y);
        if (!el) return false;
        const clickable = el.closest(
          'button, [role="button"], a, input, select, textarea',
        );
        return !!clickable;
      },
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    );
  } catch {
    return false;
  }
}

export async function getOverlapAtElementCenter(window, locator) {
  try {
    const box = await locator.boundingBox();
    if (!box) return { found: false };
    return await window.evaluate(
      () => {
        const el = document.elementFromPoint(arguments[0].x, arguments[0].y);
        if (!el) return { found: false };
        return {
          found: true,
          tagName: el.tagName,
          id: el.id || null,
          text: (el.textContent || "").trim().slice(0, 120),
        };
      },
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    );
  } catch {
    return { found: false };
  }
}

export async function callBrowserPaneVisible(window, visible, platform) {
  try {
    await window.evaluate(
      async ({ visible, platform }) => {
        if (!window.rotator?.browser) return;
        if (platform) {
          try {
            await window.rotator.browser.switchPlatform(platform);
          } catch {}
        }
        try {
          await window.rotator.browser.setVisible(visible);
        } catch {}
      },
      { visible, platform: platform || "chatgpt" },
    );
  } catch {}
}

export async function readLocalAiStatus(window) {
  return await window.evaluate(async () => {
    const result = { llmStatus: null, uiText: null, error: null };
    try {
      if (window.rotator?.llm?.status) {
        result.llmStatus = await window.rotator.llm.status();
      }
    } catch (err) {
      result.error = String(err?.message || err);
    }
    const el = document.querySelector('[data-testid="local-ai-status"]');
    if (el) result.uiText = (el.textContent || "").trim();
    return result;
  });
}
