import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import * as config from "../src/internal/config.js";
import * as browserBridge from "../src/browser-bridge.js";
import * as browserCommands from "../src/commands/browser.js";
import { askLocalLlm } from "../src/llm/local-llm.js";
import { ExperienceDb } from "../src/llm/experience-db.js";
import { DocumentIngester } from "../src/llm/document-ingester.js";

describe("Feature gates", () => {
  let tempDir;
  let oldMockLlm;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "feature-gates-"));
    oldMockLlm = process.env.VSCODE_ROTATOR_MOCK_LLM;
    process.env.VSCODE_ROTATOR_MOCK_LLM = "1";
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (oldMockLlm == null) delete process.env.VSCODE_ROTATOR_MOCK_LLM;
    else process.env.VSCODE_ROTATOR_MOCK_LLM = oldMockLlm;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("blocks LLM commands when llmCommandsEnabled is false", async () => {
    vi.spyOn(config, "loadConfig").mockResolvedValue({
      policy: { features: { llmCommandsEnabled: false } },
    });

    await expect(
      askLocalLlm({
        question: "Hi",
        system: "Hello",
        baseDir: tempDir,
        modelPath: "mock-model",
      }),
    ).rejects.toThrow(/llmCommandsEnabled/);
  });

  it("allows LLM commands when llmCommandsEnabled is omitted", async () => {
    vi.spyOn(config, "loadConfig").mockResolvedValue({});

    await expect(
      askLocalLlm({
        question: "Hi",
        system: "Hello",
        baseDir: tempDir,
        modelPath: "mock-model",
      }),
    ).resolves.toContain("Hi");
  });

  it("blocks browser capture when browserCaptureEnabled is false", async () => {
    vi.spyOn(config, "loadConfig").mockResolvedValue({
      policy: { features: { browserCaptureEnabled: false } },
    });

    await expect(
      browserCommands.captureAndIngest("chatgpt", { outputDir: tempDir }),
    ).rejects.toThrow(/browserCaptureEnabled/);
  });

  it("allows browser capture when browserCaptureEnabled is true", async () => {
    vi.spyOn(config, "loadConfig").mockResolvedValue({
      policy: { features: { browserCaptureEnabled: true } },
    });
    vi.spyOn(browserBridge, "ensureBrowserDirs").mockResolvedValue();
    vi.spyOn(browserBridge, "captureThread").mockResolvedValue({
      filePath: path.join(tempDir, "thread.json"),
      filename: "thread.json",
      turns: [],
      platform: "chatgpt",
    });
    vi.spyOn(DocumentIngester.prototype, "ingestThread").mockResolvedValue({
      chunks: 0,
    });

    await expect(
      browserCommands.captureAndIngest("chatgpt", { outputDir: tempDir }),
    ).resolves.toMatchObject({
      filename: "thread.json",
      chunksIngested: 0,
    });
  });

  it("blocks local DB when localDbEnabled is false", async () => {
    vi.spyOn(config, "loadConfig").mockResolvedValue({
      policy: { features: { localDbEnabled: false } },
    });

    const db = new ExperienceDb({ baseDir: tempDir });
    await expect(db.open()).rejects.toThrow(/localDbEnabled/);
  });

  it("allows local DB open when localDbEnabled is true", async () => {
    vi.spyOn(config, "loadConfig").mockResolvedValue({
      policy: { features: { localDbEnabled: true } },
    });

    const db = new ExperienceDb({ baseDir: tempDir });
    await expect(db.open()).resolves.toBe(db);
  });
});
