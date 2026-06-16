// @vitest-environment node
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { describe, it, expect, beforeEach, vi } from "vitest";

const mockDb = {};

vi.mock("../src/llm/storage.js", () => ({
  readJsonFile: (file, fallback) => {
    return file in mockDb
      ? JSON.parse(JSON.stringify(mockDb[file]))
      : JSON.parse(JSON.stringify(fallback));
  },
  writeJsonFile: (file, value) => {
    mockDb[file] = JSON.parse(JSON.stringify(value));
  },
}));

const writtenFiles = {};

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    writeFileSync: vi.fn((filePath, content) => {
      writtenFiles[filePath] = String(content);
    }),
  };
});

describe("Sprint 38 smoke tests — audit export functions", () => {
  beforeEach(() => {
    Object.keys(mockDb).forEach((k) => delete mockDb[k]);
    Object.keys(writtenFiles).forEach((k) => delete writtenFiles[k]);
  });

  it("exportAuditLogJson writes a file and returns ok/format/count/verification", async () => {
    const { appendAuditEvent, exportAuditLogJson } =
      await import("../src/audit/audit-log.js");

    appendAuditEvent({
      action: "workspacePolicy.set",
      actor: { type: "user", id: "pawan" },
      targetType: "workspacePolicy",
      workspaceId: "ws-38",
      details: { routingMode: "local-only" },
    });

    appendAuditEvent({
      action: "workspaceApproval.requested",
      actor: { type: "system" },
      targetType: "workspaceApproval",
      workspaceId: "ws-38",
      details: { requestedBy: "pawan" },
    });

    const result = exportAuditLogJson({ workspaceId: "ws-38" });

    expect(result.ok).toBe(true);
    expect(result.format).toBe("json");
    expect(result.count).toBe(2);
    expect(result.verification.ok).toBe(true);
    expect(result.filePath).toContain("audit-log-ws-38.json");

    const writtenPath = Object.keys(writtenFiles).find((p) =>
      p.includes("audit-log-ws-38.json"),
    );
    expect(writtenPath).toBeDefined();
    const parsed = JSON.parse(writtenFiles[writtenPath]);
    expect(parsed.verification).toBeTruthy();
    expect(parsed.events).toHaveLength(2);
  });

  it("exportAuditLogHtmlReport writes HTML file and returns ok/format/count", async () => {
    const { appendAuditEvent, exportAuditLogHtmlReport } =
      await import("../src/audit/audit-log.js");

    appendAuditEvent({
      action: "workspacePolicy.clear",
      actor: { type: "user", id: "ops" },
      targetType: "workspacePolicy",
      workspaceId: "ws-html",
      details: { reason: "cleanup" },
    });

    const result = exportAuditLogHtmlReport({ workspaceId: "ws-html" });

    expect(result.ok).toBe(true);
    expect(result.format).toBe("html");
    expect(result.count).toBe(1);
    expect(result.filePath).toContain("audit-log-ws-html.html");

    const writtenPath = Object.keys(writtenFiles).find((p) =>
      p.includes("audit-log-ws-html.html"),
    );
    expect(writtenPath).toBeDefined();
    expect(writtenFiles[writtenPath]).toContain("Audit Log Report");
    expect(writtenFiles[writtenPath]).toContain("workspacePolicy.clear");
  });

  it("exportAuditLogJson includes failed verification when log is tampered", async () => {
    const { appendAuditEvent, exportAuditLogJson } =
      await import("../src/audit/audit-log.js");

    appendAuditEvent({
      action: "workspacePolicy.set",
      actor: { type: "user", id: "alice" },
      targetType: "workspacePolicy",
      workspaceId: "ws-bad",
      details: { manualProvider: "openai" },
    });

    mockDb["audit-log.json"].events[0].action = "tampered.action";

    const result = exportAuditLogJson({ workspaceId: "ws-bad" });
    expect(result.verification.ok).toBe(false);
    expect(result.verification.failedAtSeq).toBe(1);
    expect(result.verification.reason).toBe("hash_mismatch");
  });

  it("exported JSON includes exportedAt, filter, and events array", async () => {
    const { appendAuditEvent, exportAuditLogJson } =
      await import("../src/audit/audit-log.js");

    appendAuditEvent({
      action: "workspaceApproval.approved",
      actor: { type: "user" },
      targetType: "workspaceApproval",
      workspaceId: "ws-meta",
      details: {},
    });

    exportAuditLogJson({ workspaceId: "ws-meta" });

    const writtenPath = Object.keys(writtenFiles).find((p) =>
      p.includes("audit-log-ws-meta.json"),
    );
    const parsed = JSON.parse(writtenFiles[writtenPath]);

    expect(typeof parsed.exportedAt).toBe("string");
    expect(parsed.filter.workspaceId).toBe("ws-meta");
    expect(Array.isArray(parsed.events)).toBe(true);
  });

  it("HTML report contains hash chain table headers", async () => {
    const { appendAuditEvent, exportAuditLogHtmlReport } =
      await import("../src/audit/audit-log.js");

    appendAuditEvent({
      action: "audit.test",
      actor: { type: "system" },
      targetType: "audit",
      workspaceId: "ws-table",
      details: null,
    });

    exportAuditLogHtmlReport({ workspaceId: "ws-table" });

    const writtenPath = Object.keys(writtenFiles).find((p) =>
      p.includes("audit-log-ws-table.html"),
    );
    const html = writtenFiles[writtenPath];
    expect(html).toContain("Prev Hash");
    expect(html).toContain("Hash");
  });
});

describe("Sprint 38 smoke tests — file surface and IPC", () => {
  it("audit-handlers.cjs contains export IPC channels", () => {
    const content = readFileSync(
      join(process.cwd(), "electron-ui/ipc/audit-handlers.cjs"),
      "utf-8",
    );
    expect(content).toContain("audit:exportJson");
    expect(content).toContain("audit:exportHtmlReport");
    expect(content).toContain("exportAuditLogJson");
    expect(content).toContain("exportAuditLogHtmlReport");
  });

  it("preload audit block exposes exportJson and exportHtmlReport", () => {
    const content = readFileSync(
      join(process.cwd(), "electron-ui/preload.cjs"),
      "utf-8",
    );
    expect(content).toContain("audit:exportJson");
    expect(content).toContain("audit:exportHtmlReport");
    expect(content).toContain("exportJson: (filter)");
    expect(content).toContain("exportHtmlReport: (filter)");
  });

  it("preload audit.verify and audit.latest accept filter param", () => {
    const content = readFileSync(
      join(process.cwd(), "electron-ui/preload.cjs"),
      "utf-8",
    );
    expect(content).toContain("verify: (filter)");
    expect(content).toContain("latest: (filter)");
  });

  it("types.d.ts declares exportJson and exportHtmlReport with result shapes", () => {
    const content = readFileSync(
      join(process.cwd(), "src/ui/types.d.ts"),
      "utf-8",
    );
    expect(content).toContain("exportJson:");
    expect(content).toContain("exportHtmlReport:");
    expect(content).toContain('format: "json"');
    expect(content).toContain('format: "html"');
    expect(content).toContain("expectedHash: string | null");
  });

  it("dashboard has audit verification badge and alert", () => {
    const html = readFileSync(
      join(process.cwd(), "src/ui/provider-dashboard.html"),
      "utf-8",
    );
    expect(html).toContain("audit-verification-badge");
    expect(html).toContain("audit-verification-alert");
    expect(html).toContain("Audit verification failed");
    expect(html).toContain("export-audit-json");
    expect(html).toContain("export-audit-html");
    expect(html).toContain("window.audit.exportJson");
    expect(html).toContain("window.audit.exportHtmlReport");
  });

  it("dashboard preserves Sprint 25–37 compatibility strings", () => {
    const html = readFileSync(
      join(process.cwd(), "src/ui/provider-dashboard.html"),
      "utf-8",
    );
    expect(html).toContain("Workspace Analytics");
    expect(html).toContain("Provider Trends");
    expect(html).toContain("Decision Timeline");
    expect(html).toContain("metric-success-rate");
    expect(html).toContain("metric-error-rate");
    expect(html).toContain("metric-latency");
    expect(html).toContain("workspaceRouting.analytics");
    expect(html).toContain("Audit Trail");
    expect(html).toContain("Workspace Approvals");
  });

  it("dashboard Sprint 37 approvals surface is preserved", () => {
    const html = readFileSync(
      join(process.cwd(), "src/ui/provider-dashboard.html"),
      "utf-8",
    );
    expect(html).toContain("load-workspace-approvals");
    expect(html).toContain("resolve-workspace-approval");
    expect(html).toContain("window.workspaceApproval.list");
    expect(html).toContain("window.workspaceApproval.resolve");
  });

  it("audit-log.ts exports AuditExportResult and export functions", () => {
    const content = readFileSync(
      join(process.cwd(), "src/audit/audit-log.ts"),
      "utf-8",
    );
    expect(content).toContain("AuditExportResult");
    expect(content).toContain("exportAuditLogJson");
    expect(content).toContain("exportAuditLogHtmlReport");
  });

  it("main.cjs still registers audit handlers — no regression", () => {
    const content = readFileSync(
      join(process.cwd(), "electron-ui/main.cjs"),
      "utf-8",
    );
    expect(content).toContain("registerAuditHandlers");
  });
});
