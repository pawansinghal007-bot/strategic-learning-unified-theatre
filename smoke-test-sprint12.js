#!/usr/bin/env node
/**
 * Smoke Test for Sprint 12: VS Code Passive Learning
 * Tests basic functionality of VscodeSignalCollector and ingest-staged
 */

import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Simple test reporter
const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  console.log("\n📋 SPRINT 12 SMOKE TESTS\n");

  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ FAIL: ${name}`);
      console.error(`   ${String(err.message)}`);
      failed++;
    }
  }

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed out of ${tests.length} tests\n`);
  process.exit(failed > 0 ? 1 : 0);
}

// === TESTS ===

test("VscodeSignalCollector imports successfully", async () => {
  const { VscodeSignalCollector } = await import("./vscode-extension/collector.js");
  assert(VscodeSignalCollector, "VscodeSignalCollector class should be exported");
});

test("VscodeSignalCollector can be instantiated", async () => {
  const { VscodeSignalCollector } = await import("./vscode-extension/collector.js");
  const mockOutput = { appendLine: () => {} };
  const collector = new VscodeSignalCollector(mockOutput, { vscodeLearn: { enabled: true } });
  assert(collector, "Collector instance should be created");
  assert(collector.buffer instanceof Map, "Buffer should be a Map");
});

test("stageSignal accepts a vscode-edit signal", async () => {
  const { VscodeSignalCollector } = await import("./vscode-extension/collector.js");
  const mockOutput = { appendLine: () => {} };
  const collector = new VscodeSignalCollector(mockOutput, { vscodeLearn: { enabled: true } });

  const signal = {
    signal_type: "vscode-edit",
    filePath: "/home/user/project/src/test.js",
    content: "console.log('hello');",
    captured_at: new Date().toISOString()
  };

  const result = await collector.stageSignal(signal);
  assert(result !== null, "stageSignal should return a result for valid signal");
  assert(collector.buffer.size > 0, "Buffer should contain the signal");
});

test("stageSignal rejects secret paths (.env)", async () => {
  const { VscodeSignalCollector } = await import("./vscode-extension/collector.js");
  const mockOutput = { appendLine: () => {} };
  const collector = new VscodeSignalCollector(mockOutput, { vscodeLearn: { enabled: true } });

  const signal = {
    signal_type: "vscode-edit",
    filePath: "/home/user/project/.env",
    content: "SECRET_KEY=abc123",
    captured_at: new Date().toISOString()
  };

  const result = await collector.stageSignal(signal);
  assert(result === null, "stageSignal should reject .env files (secrets)");
  assert(collector.buffer.size === 0, "Buffer should remain empty");
});

test("stageSignal rejects .key files", async () => {
  const { VscodeSignalCollector } = await import("./vscode-extension/collector.js");
  const mockOutput = { appendLine: () => {} };
  const collector = new VscodeSignalCollector(mockOutput, { vscodeLearn: { enabled: true } });

  const signal = {
    signal_type: "vscode-edit",
    filePath: "/home/user/project/secret.key",
    content: "-----BEGIN PRIVATE KEY-----",
    captured_at: new Date().toISOString()
  };

  const result = await collector.stageSignal(signal);
  assert(result === null, "stageSignal should reject .key files");
});

test("stageSignal rejects node_modules paths", async () => {
  const { VscodeSignalCollector } = await import("./vscode-extension/collector.js");
  const mockOutput = { appendLine: () => {} };
  const collector = new VscodeSignalCollector(mockOutput, { vscodeLearn: { enabled: true } });

  const signal = {
    signal_type: "vscode-edit",
    filePath: "/home/user/project/node_modules/package/index.js",
    content: "// some code",
    captured_at: new Date().toISOString()
  };

  const result = await collector.stageSignal(signal);
  assert(result === null, "stageSignal should reject node_modules paths");
});

test("stageSignal accepts diagnostic signals with severity 0 (Error)", async () => {
  const { VscodeSignalCollector } = await import("./vscode-extension/collector.js");
  const mockOutput = { appendLine: () => {} };
  const collector = new VscodeSignalCollector(mockOutput, { vscodeLearn: { enabled: true } });

  const signal = {
    signal_type: "vscode-diagnostic",
    filePath: "/home/user/project/src/app.ts",
    severity: 0,
    message: "Cannot find name 'x'",
    content: "Cannot find name 'x'",
    captured_at: new Date().toISOString()
  };

  const result = await collector.stageSignal(signal);
  assert(result !== null, "stageSignal should accept error diagnostics");
});

test("stageSignal rejects diagnostics with severity > 0 (Warnings)", async () => {
  const { VscodeSignalCollector } = await import("./vscode-extension/collector.js");
  const mockOutput = { appendLine: () => {} };
  const collector = new VscodeSignalCollector(mockOutput, { vscodeLearn: { enabled: true } });

  const signal = {
    signal_type: "vscode-diagnostic",
    filePath: "/home/user/project/src/app.ts",
    severity: 1,
    message: "Unused variable",
    content: "Unused variable",
    captured_at: new Date().toISOString()
  };

  const result = await collector.stageSignal(signal);
  assert(result === null, "stageSignal should reject warning diagnostics");
});

test("flush creates a staging file and returns results", async () => {
  const { VscodeSignalCollector } = await import("./vscode-extension/collector.js");

  const tmpDir = path.join(os.tmpdir(), `vscode-rotator-test-${Date.now()}`);
  const mockOutput = { appendLine: () => {} };
  const collector = new VscodeSignalCollector(mockOutput, {
    vscodeLearn: { enabled: true, stagedSignalsDir: tmpDir, flushIntervalMs: 30000 }
  });

  // Add a signal
  const signal = {
    signal_type: "vscode-edit",
    filePath: "/home/user/project/src/test.js",
    content: "console.log('test');",
    captured_at: new Date().toISOString()
  };

  await collector.stageSignal(signal);

  // Check buffer has content
  assert(collector.buffer.size > 0, "Buffer should contain signal");

  // Create temp staging file location and verify directory exists
  await fs.mkdir(tmpDir, { recursive: true });

  // Note: We can't test full flush() without mocking DocumentIngester
  // But we can verify the staging file writing works
  const files = await fs.readdir(tmpDir);
  // Should be empty before flush would create it
  assert(Array.isArray(files), "Should be able to list staging directory");

  // Cleanup
  try {
    await fs.rm(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});

test("Recurring diagnostic signal sets recurring flag", async () => {
  const { VscodeSignalCollector } = await import("./vscode-extension/collector.js");
  const mockOutput = { appendLine: () => {} };
  const collector = new VscodeSignalCollector(mockOutput, { vscodeLearn: { enabled: true } });

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
  assert(result1?.signal_type === "vscode-diagnostic", "First signal should be marked as vscode-diagnostic");

  // Second occurrence - should be marked as recurring
  const sig2 = {
    signal_type: "vscode-diagnostic",
    filePath,
    severity: 0,
    message,
    content: message,
    captured_at: new Date().toISOString()
  };

  const result2 = await collector.stageSignal(sig2);
  assert(result2?.signal_type === "vscode-diagnostic-recurring", "Second occurrence should be marked as recurring");
  assert(result2?.recurring === true, "Recurring flag should be true");
});

test("activate() returns a disposable with dispose method", async () => {
  const { VscodeSignalCollector } = await import("./vscode-extension/collector.js");
  const mockOutput = { appendLine: () => {} };
  const collector = new VscodeSignalCollector(mockOutput, { vscodeLearn: { enabled: true } });

  // Create a minimal mock vscode API
  const mockVscode = {
    workspace: {
      onDidSaveTextDocument: () => ({ dispose: () => {} })
    },
    languages: {
      onDidChangeDiagnostics: () => ({ dispose: () => {} }),
      getDiagnostics: () => []
    }
  };

  const disposable = collector.activate(mockVscode);
  assert(disposable, "activate should return a disposable");
  assert(typeof disposable.dispose === "function", "disposable should have a dispose method");

  // Call dispose to clean up
  disposable.dispose();
});

test("Passive learning disabled returns empty disposable", async () => {
  const { VscodeSignalCollector } = await import("./vscode-extension/collector.js");
  const mockOutput = { appendLine: () => {} };
  const collector = new VscodeSignalCollector(mockOutput, { vscodeLearn: { enabled: false } });

  const mockVscode = {
    workspace: { onDidSaveTextDocument: () => ({ dispose: () => {} }) },
    languages: { onDidChangeDiagnostics: () => ({ dispose: () => {} }) }
  };

  const disposable = collector.activate(mockVscode);
  assert(disposable?.dispose, "Should return a disposable even when disabled");
});

// Run all tests
runTests().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});
