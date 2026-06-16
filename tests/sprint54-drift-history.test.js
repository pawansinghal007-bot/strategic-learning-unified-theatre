import { describe, it, expect } from "vitest";
import { loadDashboardSurface } from './dashboard-loader.js';
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("Sprint 54 — drift-history module unit tests", () => {
  it("loadDriftHistory returns empty array for null", async () => {
    const { loadDriftHistory } =
      await import("../src/security/security-overview/drift-history.js");
    expect(loadDriftHistory(null)).toEqual([]);
  });

  it("loadDriftHistory returns empty array for undefined", async () => {
    const { loadDriftHistory } =
      await import("../src/security/security-overview/drift-history.js");
    expect(loadDriftHistory(undefined)).toEqual([]);
  });

  it("loadDriftHistory returns empty array for empty string", async () => {
    const { loadDriftHistory } =
      await import("../src/security/security-overview/drift-history.js");
    expect(loadDriftHistory("")).toEqual([]);
  });

  it("loadDriftHistory returns empty array for missing file path", async () => {
    const { loadDriftHistory } =
      await import("../src/security/security-overview/drift-history.js");
    expect(loadDriftHistory("/nonexistent/drift-history.json")).toEqual([]);
  });

  it("saveDriftHistory writes file and returns count", async () => {
    const { saveDriftHistory, loadDriftHistory } =
      await import("../src/security/security-overview/drift-history.js");
    const tmp = path.join(os.tmpdir(), `drift-history-save-${Date.now()}.json`);
    const entries = [
      {
        id: "drift-1",
        createdAt: 1000,
        classification: "regressed",
        counts: { introduced: 3, resolved: 0 },
      },
    ];
    const result = saveDriftHistory(tmp, entries);
    expect(result.ok).toBe(true);
    expect(result.count).toBe(1);
    expect(result.filePath).toBe(tmp);
    const loaded = loadDriftHistory(tmp);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe("drift-1");
    fs.unlinkSync(tmp);
  });

  it("appendDriftHistory creates file and appends one entry", async () => {
    const { appendDriftHistory, loadDriftHistory } =
      await import("../src/security/security-overview/drift-history.js");
    const tmp = path.join(
      os.tmpdir(),
      `drift-history-append-${Date.now()}.json`,
    );
    const entry = {
      id: "drift-append-1",
      createdAt: 2000,
      classification: "improved",
      workspaceId: "ws-test",
    };
    const result = appendDriftHistory(tmp, entry);
    expect(result.ok).toBe(true);
    expect(result.count).toBe(1);
    const loaded = loadDriftHistory(tmp);
    expect(loaded[0].id).toBe("drift-append-1");
    expect(loaded[0].classification).toBe("improved");
    fs.unlinkSync(tmp);
  });

  it("appendDriftHistory accumulates entries across multiple calls", async () => {
    const { appendDriftHistory, loadDriftHistory } =
      await import("../src/security/security-overview/drift-history.js");
    const tmp = path.join(
      os.tmpdir(),
      `drift-history-accum-${Date.now()}.json`,
    );
    appendDriftHistory(tmp, {
      id: "e1",
      createdAt: 1,
      classification: "clean",
    });
    appendDriftHistory(tmp, {
      id: "e2",
      createdAt: 2,
      classification: "regressed",
    });
    appendDriftHistory(tmp, {
      id: "e3",
      createdAt: 3,
      classification: "mixed",
    });
    const loaded = loadDriftHistory(tmp);
    expect(loaded).toHaveLength(3);
    expect(loaded[2].id).toBe("e3");
    fs.unlinkSync(tmp);
  });

  it("loadDriftHistory returns empty array for invalid JSON", async () => {
    const { loadDriftHistory } =
      await import("../src/security/security-overview/drift-history.js");
    const tmp = path.join(os.tmpdir(), `drift-history-bad-${Date.now()}.json`);
    fs.writeFileSync(tmp, "NOT VALID JSON", "utf8");
    expect(loadDriftHistory(tmp)).toEqual([]);
    fs.unlinkSync(tmp);
  });

  it("loadDriftHistory returns empty array if file contains non-array JSON", async () => {
    const { loadDriftHistory } =
      await import("../src/security/security-overview/drift-history.js");
    const tmp = path.join(os.tmpdir(), `drift-history-obj-${Date.now()}.json`);
    fs.writeFileSync(tmp, JSON.stringify({ entries: [] }), "utf8");
    expect(loadDriftHistory(tmp)).toEqual([]);
    fs.unlinkSync(tmp);
  });
});
