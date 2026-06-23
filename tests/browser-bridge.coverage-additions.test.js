import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as browserBridge from "../src/browser-bridge.js";

import {
  ensureBrowserDirs,
  tagResponse,
  sendPrompt,
  comparePrompts,
  clearResponses,
  getResponseMetadata,
  captureThread,
} from "../src/browser-bridge.js";

import { ExperienceDb } from "../src/llm/experience-db.js";

// Top-level Playwright mock so importing the module doesn't reach for a real
// browser. Individual tests below bypass this entirely by spying on the
// exported `launchBrowser` function instead, which lets each test control
// exactly what `page.evaluate`/`page.$` returns.
vi.mock("playwright", () => {
  const fakePage = {
    goto: vi.fn(async () => {}),
    waitForLoadState: vi.fn(async () => {}),
    $: vi.fn(async () => ({})),
    fill: vi.fn(async () => {}),
    click: vi.fn(async () => {}),
    waitForTimeout: vi.fn(async () => {}),
    evaluate: vi.fn(async () => []),
  };
  const fakeContext = {
    newPage: vi.fn(async () => fakePage),
    close: vi.fn(async () => {}),
  };
  const fakeBrowser = {
    newContext: vi.fn(async () => fakeContext),
    close: vi.fn(async () => {}),
  };
  return {
    chromium: { launch: vi.fn(async () => fakeBrowser) },
    firefox: { launch: vi.fn(async () => fakeBrowser) },
  };
});

describe("Browser Bridge — coverage additions", () => {
  let tempDir;
  let originalHome;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "browser-bridge-cov-"));
    originalHome = process.env.HOME;
    process.env.HOME = tempDir;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (originalHome) {
      process.env.HOME = originalHome;
    } else {
      delete process.env.HOME;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("tagResponse — validation and skip paths", () => {
    it("rejects an invalid quality value", async () => {
      await ensureBrowserDirs();
      const responsePath = path.join(
        tempDir,
        ".vscode-rotator",
        "browser-responses",
        "2026-05-19T10-30-45-chatgpt.md",
      );
      await fs.writeFile(responsePath, "content", "utf8");

      await expect(
        tagResponse("2026-05-19T10-30-45-chatgpt.md", {
          quality: "excellent",
          baseDir: path.join(tempDir, ".vscode-rotator"),
        }),
      ).rejects.toThrow(/Invalid quality/);
    });

    it("succeeds without updating documents when no matching db rows exist, and works with no baseDir option", async () => {
      await ensureBrowserDirs();
      const filename = "2026-05-19T10-30-45-chatgpt.md";
      const responsePath = path.join(
        tempDir,
        ".vscode-rotator",
        "browser-responses",
        filename,
      );
      await fs.writeFile(responsePath, "# Response\n\nUnindexed", "utf8");

      // No ExperienceDb rows were ever written for this file, and no baseDir
      // is passed — exercises both the `rows.length > 0` false branch and
      // the `dbOptions = baseDir ? {...} : {}` false branch together.
      const result = await tagResponse(filename, {
        quality: "good",
        notes: "fine",
      });

      expect(result).toMatchObject({
        filename,
        quality: "good",
        notes: "fine",
        mistakeCreated: false,
      });
    });
  });

  describe("sendPrompt — guard clauses and dry run", () => {
    it("requires a platform", async () => {
      await expect(sendPrompt({ prompt: "hi" })).rejects.toThrow(
        /platform is required/,
      );
    });

    it("requires a prompt", async () => {
      await expect(sendPrompt({ platform: "chatgpt" })).rejects.toThrow(
        /prompt is required/,
      );
    });

    it("returns a dry-run result without touching the browser", async () => {
      const result = await sendPrompt({
        platform: "chatgpt",
        prompt: "hello",
        dryRun: true,
      });

      expect(result).toMatchObject({
        platform: "chatgpt",
        prompt: "hello",
        dryRun: true,
      });
      expect(result.message).toContain("chatgpt");
    });

    it("throws when the input selector cannot be found on the page", async () => {
      const fakePage = {
        goto: vi.fn(async () => {}),
        waitForLoadState: vi.fn(async () => {}),
        $: vi.fn(async () => null),
      };
      const fakeContext = {
        newPage: vi.fn(async () => fakePage),
        close: vi.fn(async () => {}),
      };
      const launchSpy = vi
        .spyOn(browserBridge, "launchBrowser")
        .mockResolvedValue(fakeContext);

      await expect(
        sendPrompt({ platform: "chatgpt", prompt: "hi", dryRun: false }),
      ).rejects.toThrow(/Input selector not found/);

      launchSpy.mockRestore();
    });
  });

  describe("comparePrompts — guard clauses, dry run, and partial failure", () => {
    it("requires a prompt", async () => {
      await expect(comparePrompts({ platforms: ["chatgpt"] })).rejects.toThrow(
        /prompt is required/,
      );
    });

    it("requires at least one platform", async () => {
      await expect(
        comparePrompts({ prompt: "hi", platforms: [] }),
      ).rejects.toThrow(/At least one platform/);
    });

    it("returns a dry-run result listing the requested platforms", async () => {
      const result = await comparePrompts({
        prompt: "hi",
        platforms: ["chatgpt", "claude"],
        dryRun: true,
      });

      expect(result.dryRun).toBe(true);
      expect(result.message).toContain("chatgpt, claude");
    });

    it("records a per-platform error and still produces a report when one platform fails", async () => {
      await ensureBrowserDirs();
      const sendPromptSpy = vi
        .spyOn(browserBridge, "sendPrompt")
        .mockImplementation(async ({ platform }) => {
          if (platform === "claude") {
            throw new Error("adapter unavailable");
          }
          return {
            platform,
            prompt: "hi",
            response: "ok response",
            responsePath: path.join(tempDir, `${platform}.md`),
            timestamp: "2026-05-19T10:00:00",
          };
        });

      const result = await comparePrompts({
        prompt: "hi",
        platforms: ["chatgpt", "claude"],
        dryRun: false,
      });

      const claudeResult = result.results.find((r) => r.platform === "claude");
      expect(claudeResult.error).toContain("adapter unavailable");

      const reportContent = await fs.readFile(result.reportPath, "utf8");
      expect(reportContent).toContain("claude — Error");

      sendPromptSpy.mockRestore();
    });
  });

  describe("clearResponses — early return and age filtering", () => {
    it("returns deleted: 0 when the responses directory does not exist", async () => {
      const result = await clearResponses({});
      expect(result.deleted).toBe(0);
    });

    it("deletes all matching-platform files when olderThanDays is omitted", async () => {
      await ensureBrowserDirs();
      const responsesDir = path.join(
        tempDir,
        ".vscode-rotator",
        "browser-responses",
      );
      const fileA = path.join(responsesDir, "2020-01-01T00-00-00-chatgpt.md");
      const fileB = path.join(responsesDir, "2026-05-19T23-59-59-chatgpt.md");
      await fs.writeFile(fileA, "old", "utf8");
      await fs.writeFile(fileB, "new", "utf8");

      const result = await clearResponses({ platform: "chatgpt" });

      expect(result.deleted).toBe(2);
      await expect(fs.stat(fileA)).rejects.toThrow();
      await expect(fs.stat(fileB)).rejects.toThrow();
    });

    it("deletes only files older than the given threshold for a platform", async () => {
      await ensureBrowserDirs();
      const responsesDir = path.join(
        tempDir,
        ".vscode-rotator",
        "browser-responses",
      );
      const oldFile = path.join(responsesDir, "2020-01-01T00-00-00-chatgpt.md");
      const newFile = path.join(responsesDir, "2026-05-19T23-59-59-chatgpt.md");
      await fs.writeFile(oldFile, "old", "utf8");
      await fs.writeFile(newFile, "new", "utf8");

      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      await fs.utimes(oldFile, tenDaysAgo, tenDaysAgo);

      const result = await clearResponses({
        platform: "chatgpt",
        olderThanDays: 5,
      });

      expect(result.deleted).toBe(1);
      await expect(fs.stat(oldFile)).rejects.toThrow();
      await expect(fs.stat(newFile)).resolves.toBeTruthy();
    });
  });

  describe("getResponseMetadata", () => {
    it("returns metadata for an existing response file", async () => {
      await ensureBrowserDirs();
      const filename = "2026-05-19T10-30-45-chatgpt.md";
      const responsePath = path.join(
        tempDir,
        ".vscode-rotator",
        "browser-responses",
        filename,
      );
      await fs.writeFile(responsePath, "# Response\n\nHello", "utf8");

      const meta = await getResponseMetadata(filename);

      expect(meta.filename).toBe(filename);
      expect(meta.content).toContain("Hello");
      expect(meta.size).toBeGreaterThan(0);
      expect(meta.created).toBeTruthy();
      expect(meta.modified).toBeTruthy();
    });

    it("throws when the requested response file does not exist", async () => {
      await ensureBrowserDirs();
      await expect(getResponseMetadata("missing.md")).rejects.toThrow(
        /not found/i,
      );
    });
  });

  describe("captureThread — turn validation", () => {
    it("throws when no conversation turns are found on the page", async () => {
      const fakePage = {
        goto: vi.fn(async () => {}),
        waitForTimeout: vi.fn(async () => {}),
        evaluate: vi.fn(async () => []),
      };
      const fakeContext = {
        newPage: vi.fn(async () => fakePage),
        close: vi.fn(async () => {}),
      };
      const launchSpy = vi
        .spyOn(browserBridge, "launchBrowser")
        .mockResolvedValue(fakeContext);

      await expect(captureThread("chatgpt")).rejects.toThrow(
        /No conversation turns found/,
      );

      launchSpy.mockRestore();
    });

    it("throws when the thread is missing a user or assistant turn", async () => {
      const fakePage = {
        goto: vi.fn(async () => {}),
        waitForTimeout: vi.fn(async () => {}),
        evaluate: vi.fn(async () => [{ role: "user", content: "hi" }]),
      };
      const fakeContext = {
        newPage: vi.fn(async () => fakePage),
        close: vi.fn(async () => {}),
      };
      const launchSpy = vi
        .spyOn(browserBridge, "launchBrowser")
        .mockResolvedValue(fakeContext);

      await expect(captureThread("chatgpt")).rejects.toThrow(
        /Incomplete conversation thread/,
      );

      launchSpy.mockRestore();
    });

    it("falls back to default selectors when the override file is malformed JSON", async () => {
      const selectorsPath = path.join(
        tempDir,
        ".vscode-rotator",
        "browser-selectors.json",
      );
      await fs.mkdir(path.dirname(selectorsPath), { recursive: true });
      await fs.writeFile(selectorsPath, "{not-valid-json", "utf8");

      const fakePage = {
        goto: vi.fn(async () => {}),
        waitForTimeout: vi.fn(async () => {}),
        evaluate: vi.fn(async () => [
          { role: "user", content: "hi" },
          { role: "assistant", content: "hello" },
        ]),
      };
      const fakeContext = {
        newPage: vi.fn(async () => fakePage),
        close: vi.fn(async () => {}),
      };
      const launchSpy = vi
        .spyOn(browserBridge, "launchBrowser")
        .mockResolvedValue(fakeContext);

      const responsesDir = path.join(
        tempDir,
        ".vscode-rotator",
        "browser-responses",
      );
      await fs.mkdir(responsesDir, { recursive: true, mode: 0o700 });

      const result = await captureThread("chatgpt", {
        outputDir: responsesDir,
      });

      expect(result.turns.length).toBe(2);

      launchSpy.mockRestore();
    });
  });
});
