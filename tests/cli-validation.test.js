import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";

function createProgram() {
  const program = new Command();
  program.exitOverride();
  program.configureOutput({
    writeOut() {},
    writeErr() {}
  });
  return program;
}

function errorText(spy) {
  return spy.mock.calls.flat().map((part) => String(part)).join("\n");
}

describe("CLI validation", () => {
  let tempDir;
  let originalHome;
  let originalExitCode;
  let errorSpy;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cli-validation-"));
    originalHome = process.env.HOME;
    originalExitCode = process.exitCode;
    process.env.HOME = tempDir;
    process.exitCode = undefined;
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.resetModules();
  });

  afterEach(async () => {
    errorSpy.mockRestore();
    process.env.HOME = originalHome;
    process.exitCode = originalExitCode;
    await fs.rm(tempDir, { recursive: true, force: true });
    vi.resetModules();
    vi.doUnmock("../src/browser-bridge.js");
  });

  it("handoff create --limit not-a-number reports ROTATOR_CLI_INVALID", async () => {
    const { bindHandoffCommands } = await import("../src/commands/handoff.js");
    const program = createProgram();
    bindHandoffCommands(program);

    await program.parseAsync([
      "node",
      "test",
      "handoff",
      "create",
      "--goal",
      "Test",
      "--limit",
      "not-a-number"
    ]);

    expect(errorText(errorSpy)).toContain("ROTATOR_CLI_INVALID");
    expect(process.exitCode).toBe(1);
  });

  it("handoff create --status weird reports ROTATOR_CLI_INVALID", async () => {
    const { bindHandoffCommands } = await import("../src/commands/handoff.js");
    const program = createProgram();
    bindHandoffCommands(program);

    await program.parseAsync([
      "node",
      "test",
      "handoff",
      "create",
      "--goal",
      "Test",
      "--status",
      "weird"
    ]);

    expect(errorText(errorSpy)).toContain("ROTATOR_CLI_INVALID");
    expect(process.exitCode).toBe(1);
  });

  it("idea add --priority 7 reports ROTATOR_CLI_INVALID, no file created", async () => {
    const { bindIdeaCommands } = await import("../src/commands/idea.js");
    const program = createProgram();
    await bindIdeaCommands(program);

    await program.parseAsync([
      "node",
      "test",
      "idea",
      "add",
      "--priority",
      "7"
    ]);

    expect(errorText(errorSpy)).toContain("ROTATOR_CLI_INVALID");
    const ideaRoot = path.join(tempDir, ".vscode-rotator", "ideas");
    const files = await fs.readdir(ideaRoot).catch(() => []);
    expect(files).toHaveLength(0);
  });

  it("browser send --platform badllm reports ROTATOR_CLI_INVALID, no browser launch", async () => {
    const sendPrompt = vi.fn();
    vi.doMock("../src/browser-bridge.js", () => ({
      ensureBrowserDirs: vi.fn(async () => {}),
      sendPrompt,
      comparePrompts: vi.fn(),
      loadPromptLibrary: vi.fn(),
      addPrompt: vi.fn(),
      findPrompt: vi.fn(),
      updatePrompt: vi.fn(),
      deletePrompt: vi.fn(),
      runPromptTemplate: vi.fn(),
      loginToPage: vi.fn(),
      listResponses: vi.fn(),
      getResponseMetadata: vi.fn(),
      clearResponses: vi.fn(),
      tagResponse: vi.fn(),
      captureThread: vi.fn(),
      BROWSER_RESPONSES_DIR: path.join(tempDir, ".vscode-rotator", "browser-responses")
    }));
    const { bindBrowserCommands } = await import("../src/commands/browser.js");
    const program = createProgram();
    bindBrowserCommands(program);

    await program.parseAsync([
      "node",
      "test",
      "browser",
      "send",
      "--platform",
      "badllm",
      "--prompt",
      "Hello"
    ]);

    expect(errorText(errorSpy)).toContain("ROTATOR_CLI_INVALID");
    expect(sendPrompt).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("browser login --timeout foo reports ROTATOR_CLI_INVALID", async () => {
    const loginToPage = vi.fn();
    vi.doMock("../src/browser-bridge.js", () => ({
      ensureBrowserDirs: vi.fn(async () => {}),
      sendPrompt: vi.fn(),
      comparePrompts: vi.fn(),
      loadPromptLibrary: vi.fn(),
      addPrompt: vi.fn(),
      findPrompt: vi.fn(),
      updatePrompt: vi.fn(),
      deletePrompt: vi.fn(),
      runPromptTemplate: vi.fn(),
      loginToPage,
      listResponses: vi.fn(),
      getResponseMetadata: vi.fn(),
      clearResponses: vi.fn(),
      tagResponse: vi.fn(),
      captureThread: vi.fn(),
      BROWSER_RESPONSES_DIR: path.join(tempDir, ".vscode-rotator", "browser-responses")
    }));
    const { bindBrowserCommands } = await import("../src/commands/browser.js");
    const program = createProgram();
    bindBrowserCommands(program);

    await program.parseAsync([
      "node",
      "test",
      "browser",
      "login",
      "--platform",
      "chatgpt",
      "--timeout",
      "foo"
    ]);

    expect(errorText(errorSpy)).toContain("ROTATOR_CLI_INVALID");
    expect(loginToPage).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});
