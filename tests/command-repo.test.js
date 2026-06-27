import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MemoryDb } from "../../src/ai-memory/memory-db.js";
import { CommandsRepo } from "../../src/ai-memory/repositories/commands-repo.js";

describe("CommandsRepo", () => {
  let tempDir;
  let originalHome;
  let db;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "commands-repo-test-"));
    originalHome = process.env.HOME;
    process.env.HOME = tempDir;

    db = new MemoryDb();
    await db.init();
  });

  afterEach(async () => {
    db.close();
    if (originalHome == null) delete process.env.HOME;
    else process.env.HOME = originalHome;
    // Small delay to let better-sqlite3 release file handles before deletion.
    await new Promise((resolve) => setTimeout(resolve, 50));
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("adds a command with all fields explicitly provided", () => {
    const repo = new CommandsRepo(db);
    const saved = repo.add({
      category: "setup",
      powershell_command: "Set-Location 'C:\\temp'",
      notes: "Explicit notes",
      created_at: "2026-01-01T00:00:00.000Z",
    });

    expect(saved.category).toBe("setup");
    expect(saved.powershell_command).toBe("Set-Location 'C:\\temp'");
    expect(saved.notes).toBe("Explicit notes");
    expect(saved.created_at).toBe("2026-01-01T00:00:00.000Z");
    expect(saved.id).toBeDefined();
  });

  it("defaults category to 'general' when omitted (line 13)", () => {
    const repo = new CommandsRepo(db);
    const saved = repo.add({ powershell_command: "Get-ChildItem" });

    expect(saved.category).toBe("general");
  });

  it("defaults notes to an empty string when omitted (line 15)", () => {
    const repo = new CommandsRepo(db);
    const saved = repo.add({ powershell_command: "Get-ChildItem" });

    expect(saved.notes).toBe("");
  });

  it("defaults created_at to the current ISO timestamp when omitted (line 11)", () => {
    const before = Date.now();
    const repo = new CommandsRepo(db);
    const saved = repo.add({ powershell_command: "Get-ChildItem" });
    const after = Date.now();

    const savedMs = Date.parse(saved.created_at);
    expect(savedMs).toBeGreaterThanOrEqual(before);
    expect(savedMs).toBeLessThanOrEqual(after);
  });

  it("lists commands ordered by created_at descending", () => {
    const repo = new CommandsRepo(db);
    repo.add({
      powershell_command: "first",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    repo.add({
      powershell_command: "second",
      created_at: "2026-02-01T00:00:00.000Z",
    });
    repo.add({
      powershell_command: "third",
      created_at: "2026-03-01T00:00:00.000Z",
    });

    const all = repo.list();
    expect(all.map((c) => c.powershell_command)).toEqual([
      "third",
      "second",
      "first",
    ]);
  });

  it("getById returns undefined for a non-existent id", () => {
    const repo = new CommandsRepo(db);
    expect(repo.getById(999999)).toBeUndefined();
  });

  it("getById returns the matching row for a real id", () => {
    const repo = new CommandsRepo(db);
    const saved = repo.add({ powershell_command: "Get-Process" });
    const fetched = repo.getById(saved.id);

    expect(fetched).toEqual(saved);
  });
});
