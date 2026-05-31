import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { VscodeSignalCollector } from "../../vscode-extension/collector.js";

describe("VscodeSignalCollector", () => {
  let mockOutput;
  let collector;
  let tmpDir;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `vscode-test-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });

    mockOutput = {
      appendLine: vi.fn()
    };
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  describe("Constructor & Config", () => {
    it("should initialize with disabled passive learning by default", () => {
      collector = new VscodeSignalCollector(mockOutput, {});
      expect(collector.vscodeLearn.enabled).toBe(false);
    });

    it("should use correct defaults when config fields missing", () => {
      collector = new VscodeSignalCollector(mockOutput, { vscodeLearn: { enabled: true } });
      expect(collector.vscodeLearn.flushIntervalMs).toBe(30000);
      expect(collector.vscodeLearn.debounceMs).toBe(600000);
      expect(collector.vscodeLearn.maxFileSizeBytes).toBe(102400);
    });

    it("should default stagingDir to ~/.vscode-rotator/vscode-signals", () => {
      collector = new VscodeSignalCollector(mockOutput, { vscodeLearn: { enabled: true } });
      const expectedPath = path.join(os.homedir(), ".vscode-rotator", "vscode-signals");
      expect(collector.stagedSignalsDir).toBe(expectedPath);
    });

    it("contributes the ingest staged signals command in the VS Code package", async () => {
      const extensionPackage = JSON.parse(await fs.readFile(path.resolve("vscode-extension", "package.json"), "utf8"));
      const commands = extensionPackage.contributes.commands.map((command) => command.command);
      const activationEvents = extensionPackage.activationEvents;

      expect(commands).toContain("strategic-learning-unified-theatre.ingestStagedSignals");
      expect(activationEvents).toContain("onCommand:strategic-learning-unified-theatre.ingestStagedSignals");
    });
  });

  describe("stageSignal() — Hard-Exclude", () => {
    beforeEach(() => {
      collector = new VscodeSignalCollector(mockOutput, { vscodeLearn: { enabled: true } });
    });

    it("should reject .env file paths", async () => {
      const signal = {
        signal_type: "vscode-edit",
        filePath: "/home/user/.env",
        content: "SECRET_KEY=abc123",
        captured_at: new Date().toISOString()
      };

      const result = await collector.stageSignal(signal);
      expect(result).toBeNull();
      expect(collector.buffer.size).toBe(0);
    });

    it("should reject .key file paths", async () => {
      const signal = {
        signal_type: "vscode-edit",
        filePath: "/home/user/secret.key",
        content: "-----BEGIN PRIVATE KEY-----",
        captured_at: new Date().toISOString()
      };

      const result = await collector.stageSignal(signal);
      expect(result).toBeNull();
      expect(collector.buffer.size).toBe(0);
    });

    it("should reject node_modules paths", async () => {
      const signal = {
        signal_type: "vscode-edit",
        filePath: "/home/user/project/node_modules/pkg/index.js",
        content: "module.exports = {}",
        captured_at: new Date().toISOString()
      };

      const result = await collector.stageSignal(signal);
      expect(result).toBeNull();
      expect(collector.buffer.size).toBe(0);
    });

    it("should accept valid .js file paths", async () => {
      const signal = {
        signal_type: "vscode-edit",
        filePath: "/home/user/project/src/index.js",
        content: "console.log('hello');",
        captured_at: new Date().toISOString()
      };

      const result = await collector.stageSignal(signal);
      expect(result).not.toBeNull();
      expect(collector.buffer.size).toBeGreaterThan(0);
    });

    it("should reject non-allowed extensions (.exe)", async () => {
      const signal = {
        signal_type: "vscode-edit",
        filePath: "/home/user/app.exe",
        content: "binary content",
        captured_at: new Date().toISOString()
      };

      const result = await collector.stageSignal(signal);
      expect(result).toBeNull();
      expect(collector.buffer.size).toBe(0);
    });
  });

  describe("stageSignal() — Debounce & Size", () => {
    beforeEach(() => {
      collector = new VscodeSignalCollector(mockOutput, { vscodeLearn: { enabled: true } });
    });

    it("should debounce same file within debounceMs", async () => {
      const filePath = "/home/user/project/src/app.js";
      const signal1 = {
        signal_type: "vscode-edit",
        filePath,
        content: "console.log('first');",
        captured_at: new Date().toISOString()
      };

      const result1 = await collector.stageSignal(signal1);
      expect(result1).not.toBeNull();
      expect(collector.buffer.size).toBe(1);

      // Stage same file again immediately
      const signal2 = {
        signal_type: "vscode-edit",
        filePath,
        content: "console.log('second');",
        captured_at: new Date().toISOString()
      };

      const result2 = await collector.stageSignal(signal2);
      expect(result2).toBeNull();
      expect(collector.buffer.size).toBe(1); // Should still be 1
    });

    it("should skip content exceeding maxFileSizeBytes", async () => {
      const largeContent = "x".repeat(200000); // > 102400 bytes

      const signal = {
        signal_type: "vscode-edit",
        filePath: "/home/user/project/src/large.js",
        content: largeContent,
        captured_at: new Date().toISOString()
      };

      const result = await collector.stageSignal(signal);
      expect(result).toBeNull();
      expect(mockOutput.appendLine).toHaveBeenCalledWith(
        expect.stringContaining("exceeds maxFileSizeBytes")
      );
    });
  });

  describe("stageSignal() — Diagnostic signals", () => {
    beforeEach(() => {
      collector = new VscodeSignalCollector(mockOutput, { vscodeLearn: { enabled: true } });
    });

    it("should reject Warning diagnostics (severity > 0)", async () => {
      const signal = {
        signal_type: "vscode-diagnostic",
        filePath: "/home/user/project/src/app.ts",
        severity: 1,
        message: "Unused variable",
        content: "Unused variable",
        captured_at: new Date().toISOString()
      };

      const result = await collector.stageSignal(signal);
      expect(result).toBeNull();
      expect(collector.buffer.size).toBe(0);
    });

    it("should accept Error diagnostics (severity = 0)", async () => {
      const signal = {
        signal_type: "vscode-diagnostic",
        filePath: "/home/user/project/src/app.ts",
        severity: 0,
        message: "Cannot find name 'x'",
        content: "Cannot find name 'x'",
        captured_at: new Date().toISOString()
      };

      const result = await collector.stageSignal(signal);
      expect(result).not.toBeNull();
      expect(result.source_type).toBe("vscode-diagnostic");
    });

    it("should mark 2nd occurrence as vscode-diagnostic-recurring", async () => {
      const filePath = "/home/user/project/src/app.ts";
      const message = "Cannot find name 'x'";

      // First occurrence
      const sig1 = {
        signal_type: "vscode-diagnostic",
        filePath,
        severity: 0,
        message,
        content: message,
        captured_at: new Date().toISOString()
      };

      const result1 = await collector.stageSignal(sig1);
      expect(result1.signal_type).toBe("vscode-diagnostic");

      // Second occurrence
      const sig2 = {
        signal_type: "vscode-diagnostic",
        filePath,
        severity: 0,
        message,
        content: message,
        captured_at: new Date().toISOString()
      };

      const result2 = await collector.stageSignal(sig2);
      expect(result2.signal_type).toBe("vscode-diagnostic-recurring");
      expect(result2.recurring).toBe(true);
    });
  });

  describe("stageSignal() — Git & Task signals", () => {
    beforeEach(() => {
      collector = new VscodeSignalCollector(mockOutput, { vscodeLearn: { enabled: true } });
    });

    it("should accept git signals with commit hash and message", async () => {
      const signal = {
        signal_type: "vscode-git",
        commit_hash: "a1b2c3d",
        commit_message: "Fix: resolve dependency issue",
        files_changed: ["src/app.js", "package.json"],
        content: "Git commit captured",
        captured_at: new Date().toISOString()
      };

      const result = await collector.stageSignal(signal);
      expect(result).not.toBeNull();
      expect(result.source_type).toBe("vscode-git");
    });

    it("should reject task with exit code 0", async () => {
      const signal = {
        signal_type: "vscode-task-error",
        command: "npm test",
        exit_code: 0,
        content: "Tests passed",
        captured_at: new Date().toISOString()
      };

      const result = await collector.stageSignal(signal);
      expect(result).toBeNull();
    });

    it("should accept task with exit code 1", async () => {
      const signal = {
        signal_type: "vscode-task-error",
        command: "npm test",
        exit_code: 1,
        content: "Test failed",
        captured_at: new Date().toISOString()
      };

      const result = await collector.stageSignal(signal);
      expect(result).not.toBeNull();
      expect(result.source_type).toBe("vscode-task-error");
    });
  });

  describe("flush()", () => {
    beforeEach(() => {
      collector = new VscodeSignalCollector(mockOutput, {
        vscodeLearn: { enabled: true, stagedSignalsDir: tmpDir, flushIntervalMs: 30000 }
      });
    });

    it("should skip flush when buffer is empty", async () => {
      const results = await collector.flush();
      expect(results).toHaveLength(0);
      expect(mockOutput.appendLine).toHaveBeenCalledWith(expect.stringContaining("no staged signals"));
    });

    it("should write staging file with YAML frontmatter format", async () => {
      const ingestSpy = vi.spyOn(collector, "ingestStagedSignals").mockResolvedValue([{ chunks: 3 }]);
      await collector.stageSignal({
        signal_type: "vscode-edit",
        filePath: "/home/user/project/src/test.js",
        content: "console.log('test');",
        captured_at: "2026-05-21T10:00:00.000Z"
      });
      await collector.stageSignal({
        signal_type: "vscode-git",
        commit_hash: "abc123",
        commit_message: "Sprint 12 signal capture",
        content: "Commit abc123 Sprint 12 signal capture",
        captured_at: "2026-05-21T10:01:00.000Z"
      });
      await collector.stageSignal({
        signal_type: "vscode-task-error",
        command: "npm test",
        exit_code: 1,
        content: "Tests failed",
        captured_at: "2026-05-21T10:02:00.000Z"
      });

      const results = await collector.flush();
      const files = await fs.readdir(tmpDir);
      const stagedContent = await fs.readFile(path.join(tmpDir, files[0]), "utf8");

      expect(results).toEqual([{ chunks: 3 }]);
      expect(ingestSpy).toHaveBeenCalledTimes(1);
      expect(stagedContent).toContain("---\ntype: \"signal\"");
      expect(stagedContent).toContain("signal_type: \"vscode-edit\"");
      expect(stagedContent).toContain("signal_type: \"vscode-git\"");
      expect(stagedContent).toContain("signal_type: \"vscode-task-error\"");
      expect(stagedContent).toContain("console.log('test');");
    });

    it("should clear buffer after flush and invoke staged ingestion", async () => {
      const ingestSpy = vi.spyOn(collector, "ingestStagedSignals").mockResolvedValue([]);
      const signal = {
        signal_type: "vscode-edit",
        filePath: "/home/user/project/src/test.js",
        content: "console.log('test');",
        captured_at: new Date().toISOString()
      };

      await collector.stageSignal(signal);
      expect(collector.buffer.size).toBe(1);

      await collector.flush();
      expect(collector.buffer.size).toBe(0);
      expect(ingestSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("activate() method", () => {
    beforeEach(() => {
      collector = new VscodeSignalCollector(mockOutput, { vscodeLearn: { enabled: true } });
    });

    it("should return disposable with dispose method when enabled", () => {
      const mockVscode = {
        workspace: {
          onDidSaveTextDocument: vi.fn(() => ({ dispose: vi.fn() }))
        },
        languages: {
          onDidChangeDiagnostics: vi.fn(() => ({ dispose: vi.fn() })),
          getDiagnostics: vi.fn(() => [])
        }
      };

      const disposable = collector.activate(mockVscode);
      expect(disposable).not.toBeNull();
      expect(typeof disposable.dispose).toBe("function");

      // Cleanup
      disposable.dispose();
    });

    it("should return empty disposable when passive learning disabled", () => {
      const disabledCollector = new VscodeSignalCollector(mockOutput, { vscodeLearn: { enabled: false } });

      const mockVscode = {
        workspace: {
          onDidSaveTextDocument: vi.fn()
        },
        languages: {
          onDidChangeDiagnostics: vi.fn()
        }
      };

      const disposable = disabledCollector.activate(mockVscode);
      expect(disposable?.dispose).toBeDefined();
      expect(mockVscode.workspace.onDidSaveTextDocument).not.toHaveBeenCalled();
      expect(mockVscode.languages.onDidChangeDiagnostics).not.toHaveBeenCalled();
    });

    it("should return empty disposable when vscode API not available", () => {
      const disposable = collector.activate(null);
      expect(disposable?.dispose).toBeDefined();
    });
  });

  describe("Signal validation & filtering", () => {
    beforeEach(() => {
      collector = new VscodeSignalCollector(mockOutput, { vscodeLearn: { enabled: true } });
    });

    it("should reject signals without content", async () => {
      const signal = {
        signal_type: "vscode-edit",
        filePath: "/home/user/project/src/empty.js",
        content: "",
        captured_at: new Date().toISOString()
      };

      await expect(async () => {
        await collector.stageSignal(signal);
      }).rejects.toThrow();
    });

    it("should accept .ts, .tsx, .jsx files", async () => {
      for (const ext of [".ts", ".tsx", ".jsx"]) {
        const signal = {
          signal_type: "vscode-edit",
          filePath: `/home/user/project/src/test${ext}`,
          content: "console.log('test');",
          captured_at: new Date().toISOString()
        };

        const result = await collector.stageSignal(signal);
        expect(result).not.toBeNull();
      }
    });

    it("should accept Python and Markdown files", async () => {
      for (const ext of [".py", ".md"]) {
        const signal = {
          signal_type: "vscode-edit",
          filePath: `/home/user/project/src/test${ext}`,
          content: "# test content",
          captured_at: new Date().toISOString()
        };

        const result = await collector.stageSignal(signal);
        expect(result).not.toBeNull();
      }
    });
  });

  describe("Additional hard-exclude patterns", () => {
    beforeEach(() => {
      collector = new VscodeSignalCollector(mockOutput, { vscodeLearn: { enabled: true } });
    });

    it("should reject .pem certificate files", async () => {
      const signal = {
        signal_type: "vscode-edit",
        filePath: "/home/user/certs/server.pem",
        content: "-----BEGIN CERTIFICATE-----",
        captured_at: new Date().toISOString()
      };

      const result = await collector.stageSignal(signal);
      expect(result).toBeNull();
    });

    it("should reject .p12 certificate files", async () => {
      const signal = {
        signal_type: "vscode-edit",
        filePath: "/home/user/certs/client.p12",
        content: "binary cert",
        captured_at: new Date().toISOString()
      };

      const result = await collector.stageSignal(signal);
      expect(result).toBeNull();
    });

    it("should reject .pfx certificate files", async () => {
      const signal = {
        signal_type: "vscode-edit",
        filePath: "/home/user/certs/bundle.pfx",
        content: "binary cert",
        captured_at: new Date().toISOString()
      };

      const result = await collector.stageSignal(signal);
      expect(result).toBeNull();
    });

    it("should reject paths containing 'secret' in filename", async () => {
      const signal = {
        signal_type: "vscode-edit",
        filePath: "/home/user/project/src/my-secret.js",
        content: "const API_KEY = '...';",
        captured_at: new Date().toISOString()
      };

      const result = await collector.stageSignal(signal);
      expect(result).toBeNull();
    });

    it("should reject id_rsa SSH keys", async () => {
      const signal = {
        signal_type: "vscode-edit",
        filePath: "/home/user/.ssh/id_rsa",
        content: "-----BEGIN OPENSSH PRIVATE KEY-----",
        captured_at: new Date().toISOString()
      };

      const result = await collector.stageSignal(signal);
      expect(result).toBeNull();
    });

    it("should reject .dist and .build directories", async () => {
      for (const dir of ["dist", "build"]) {
        const signal = {
          signal_type: "vscode-edit",
          filePath: `/home/user/project/${dir}/index.js`,
          content: "compiled output",
          captured_at: new Date().toISOString()
        };

        const result = await collector.stageSignal(signal);
        expect(result).toBeNull();
      }
    });

    it("should reject .git directory files", async () => {
      const signal = {
        signal_type: "vscode-edit",
        filePath: "/home/user/project/.git/config",
        content: "[core]",
        captured_at: new Date().toISOString()
      };

      const result = await collector.stageSignal(signal);
      expect(result).toBeNull();
    });
  });

  describe("Multiple signal scenarios", () => {
    beforeEach(() => {
      collector = new VscodeSignalCollector(mockOutput, { vscodeLearn: { enabled: true } });
    });

    it("should handle multiple diagnostics in same file", async () => {
      const filePath = "/home/user/project/src/app.ts";
      const signal = {
        signal_type: "vscode-diagnostic",
        filePath,
        severity: 0,
        message: "Cannot find name 'foo'",
        content: "Error 1: Cannot find name 'foo'\nError 2: Unexpected token",
        captured_at: new Date().toISOString()
      };

      const result = await collector.stageSignal(signal);
      expect(result).not.toBeNull();
      expect(collector.buffer.size).toBe(1);
    });

    it("should stage different signal types in sequence", async () => {
      const sig1 = {
        signal_type: "vscode-edit",
        filePath: "/home/user/project/src/test.js",
        content: "console.log('edit');",
        captured_at: new Date().toISOString()
      };

      const sig2 = {
        signal_type: "vscode-diagnostic",
        filePath: "/home/user/project/src/test.ts",
        severity: 0,
        message: "Type error",
        content: "Type error",
        captured_at: new Date().toISOString()
      };

      const sig3 = {
        signal_type: "vscode-git",
        commit_hash: "xyz789",
        commit_message: "Multi-signal test",
        content: "Commit xyz789",
        captured_at: new Date().toISOString()
      };

      await collector.stageSignal(sig1);
      await collector.stageSignal(sig2);
      await collector.stageSignal(sig3);

      expect(collector.buffer.size).toBe(3);
      expect(Array.from(collector.buffer.values()).map(s => s.signal_type)).toEqual(
        ["vscode-edit", "vscode-diagnostic", "vscode-git"]
      );
    });

    it("should handle task errors with various exit codes", async () => {
      for (const exitCode of [1, 127, 255]) {
        const signal = {
          signal_type: "vscode-task-error",
          command: `test-task-${exitCode}`,
          exit_code: exitCode,
          content: `Task exited with code ${exitCode}`,
          captured_at: new Date().toISOString()
        };

        const result = await collector.stageSignal(signal);
        expect(result).not.toBeNull();
        expect(result.exit_code).toBe(exitCode);
      }
    });

    it("should count recurring diagnostics across multiple stagings", async () => {
      const filePath = "/home/user/project/src/app.ts";
      const message1 = "Cannot find name 'x'";

      // Different message first
      const sig1 = { signal_type: "vscode-diagnostic", filePath, severity: 0, message: message1, content: message1, captured_at: new Date().toISOString() };
      const res1 = await collector.stageSignal(sig1);
      expect(res1).not.toBeNull();
      expect(res1.signal_type).toBe("vscode-diagnostic");
      expect(res1.recurring).toBe(false);

      // Same message again in DIFFERENT collector (no debounce)
      const collector2 = new VscodeSignalCollector(mockOutput, { vscodeLearn: { enabled: true } });
      
      const sig2a = { signal_type: "vscode-diagnostic", filePath, severity: 0, message: message1, content: message1, captured_at: new Date().toISOString() };
      const res2a = await collector2.stageSignal(sig2a);
      expect(res2a).not.toBeNull();
      expect(res2a.signal_type).toBe("vscode-diagnostic");

      const sig2b = { signal_type: "vscode-diagnostic", filePath, severity: 0, message: message1, content: message1, captured_at: new Date().toISOString() };
      const res2b = await collector2.stageSignal(sig2b);
      expect(res2b).not.toBeNull();
      expect(res2b.signal_type).toBe("vscode-diagnostic-recurring");
    });
  });

  describe("Git signal edge cases", () => {
    beforeEach(() => {
      collector = new VscodeSignalCollector(mockOutput, { vscodeLearn: { enabled: true } });
    });

    it("should reject git signal missing commit hash", async () => {
      const signal = {
        signal_type: "vscode-git",
        commit_hash: "",
        commit_message: "Commit message",
        content: "Git signal",
        captured_at: new Date().toISOString()
      };

      const result = await collector.stageSignal(signal);
      expect(result).toBeNull();
    });

    it("should reject git signal missing commit message", async () => {
      const signal = {
        signal_type: "vscode-git",
        commit_hash: "abc123",
        commit_message: "",
        content: "Git signal",
        captured_at: new Date().toISOString()
      };

      const result = await collector.stageSignal(signal);
      expect(result).toBeNull();
    });

    it("should accept git signal with files_changed array", async () => {
      const signal = {
        signal_type: "vscode-git",
        commit_hash: "abc123",
        commit_message: "Add feature",
        files_changed: ["src/feature.js", "test/feature.test.js"],
        content: "Git commit",
        captured_at: new Date().toISOString()
      };

      const result = await collector.stageSignal(signal);
      expect(result).not.toBeNull();
      expect(result.files_changed).toEqual(["src/feature.js", "test/feature.test.js"]);
    });
  });

  describe("Buffer and staging operations", () => {
    beforeEach(() => {
      collector = new VscodeSignalCollector(mockOutput, {
        vscodeLearn: { enabled: true, stagedSignalsDir: tmpDir, flushIntervalMs: 30000 }
      });
    });

    it("should preserve signal metadata through staging", async () => {
      const signal = {
        signal_type: "vscode-edit",
        filePath: "/home/user/project/src/test.js",
        content: "console.log('metadata');",
        captured_at: "2026-05-21T12:00:00.000Z",
        tags: ["sprint-12", "passive-learning"]
      };

      const result = await collector.stageSignal(signal);
      expect(result.tags).toEqual(["sprint-12", "passive-learning"]);
      expect(result.captured_at).toBe("2026-05-21T12:00:00.000Z");
    });

    it("should handle concurrent signal staging", async () => {
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          collector.stageSignal({
            signal_type: "vscode-edit",
            filePath: `/home/user/project/src/file${i}.js`,
            content: `console.log('file ${i}');`,
            captured_at: new Date().toISOString()
          })
        );
      }

      const results = await Promise.all(promises);
      expect(results.every(r => r !== null)).toBe(true);
      expect(collector.buffer.size).toBe(5);
    });
  });
});
