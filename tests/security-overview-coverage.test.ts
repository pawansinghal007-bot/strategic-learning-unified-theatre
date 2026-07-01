/**
 * tests/security-overview-coverage.test.ts
 *
 * Coverage extensions for src/security/security-overview/*
 *
 * Targets:
 *   ai-explain.ts      — lines 76, 178
 *   auto-scan.ts       — lines 44,68,72,76,121-127,171
 *   baseline.ts        — lines 16,24
 *   drift.ts           — lines 38,84,172-174
 *   drift-history.ts   — lines 35-39
 *   index.ts           — 0% (barrel re-exports)
 *   normalizer.ts      — lines 11-15,38,53
 *   suppressions.ts    — line 43
 *   triage.ts          — lines 68-94
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";


// ─────────────────────────────────────────────────────────────────────────────
// ai-explain.ts — line 76 (compactText: empty string when value is not a string)
//                 line 178 (buildKnowledgeQuery: title adds first 6 words)
// ─────────────────────────────────────────────────────────────────────────────
describe("ai-explain — uncovered branches", () => {
  it("line 76: compactText returns empty string for non-string description (null/undefined)", async () => {
    const { buildIntroducedFindingsPrompt } =
      await import("../src/security/security-overview/ai-explain.js");
    // null description goes through compactText — typeof null !== "string" → returns ""
    const prompt = buildIntroducedFindingsPrompt({
      findings: [{ title: "T", description: null as any }],
    });
    expect(prompt).toContain("Introduced findings count: 1");
    expect(prompt).not.toContain('"description": "null"');
  });

  it("line 76: compactText returns empty string for numeric description", async () => {
    const { buildIntroducedFindingsPrompt } =
      await import("../src/security/security-overview/ai-explain.js");
    const prompt = buildIntroducedFindingsPrompt({
      findings: [{ title: "T", description: 42 as any }],
    });
    expect(prompt).toContain("Introduced findings count: 1");
  });

  it("line 178: buildKnowledgeQuery uses first-6-word title when category/scanner are unknown", async () => {
    // We exercise this via explainIntroducedFindings with auto-query
    const searchMock = vi.fn().mockResolvedValue([]);
    (globalThis as any).window = {
      workspaceKnowledge: { search: searchMock },
      llm: {
        ask: vi.fn().mockResolvedValue({
          answer: JSON.stringify({ summary: "ok", items: [] }),
        }),
      },
    };
    const { explainIntroducedFindings } =
      await import("../src/security/security-overview/ai-explain.js");

    await explainIntroducedFindings({
      drift: {
        introduced: [
          {
            title: "one two three four five six seven",
            // no category, no scanner — forces title path in buildKnowledgeQuery
          },
        ],
      },
    });

    expect(searchMock).toHaveBeenCalled();
    const query: string = searchMock.mock.calls[0][0];
    // Should contain at most 6 words from the title
    expect(query).toContain("one two three four five six");
    expect(query).not.toContain("seven");

    delete (globalThis as any).window;
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// auto-scan.ts — line 44 (tryLoadJson returns null on bad JSON)
//                line 68 (imageRef truthy → calls runTrivyImage)
//                line 72 (suppressionsPath null → _suppressions stays null)
//                line 76 (triagePath provided → loads triage entries)
//                lines 121-127 (driftHistoryAppend is set when drift && driftHistoryPath)
//                line 171 (catch block: returns ok=false with error string)
// ─────────────────────────────────────────────────────────────────────────────

const autoScanMocks = vi.hoisted(() => ({
  runSecretsScan: vi.fn(),
  runDependencyCheck: vi.fn(),
  runTrivyImage: vi.fn(),
}));

vi.mock("../src/security/secrets/index.js", () => ({
  runSecretsScan: autoScanMocks.runSecretsScan,
}));

vi.mock("../src/security/risks/index.js", () => ({
  runDependencyCheck: autoScanMocks.runDependencyCheck,
  runTrivyImage: autoScanMocks.runTrivyImage,
}));

describe("auto-scan — uncovered branches", () => {
  const tmpDir = path.join(os.tmpdir(), `auto-scan-cov-${Date.now()}`);

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
    autoScanMocks.runSecretsScan.mockReset();
    autoScanMocks.runDependencyCheck.mockReset();
    autoScanMocks.runTrivyImage.mockReset();
    autoScanMocks.runSecretsScan.mockResolvedValue({ findings: [] });
    autoScanMocks.runDependencyCheck.mockResolvedValue({ findings: [] });
    autoScanMocks.runTrivyImage.mockResolvedValue({ findings: [] });
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /**/ }
  });

  it("line 44: tryLoadJson returns null for invalid JSON file (suppressionsPath branch)", async () => {
    const { runSecurityAutoScan } =
      await import("../src/security/security-overview/auto-scan.js");
    const badJson = path.join(tmpDir, "bad.json");
    fs.writeFileSync(badJson, "{ not valid json }");
    // Passing bad JSON as suppressionsPath — tryLoadJson catches & returns null
    const result = await runSecurityAutoScan({
      repoPath: tmpDir,
      suppressionsPath: badJson,
    });
    expect(result.ok).toBe(true);
  });

  it("line 68: imageRef truthy → runTrivyImage is called", async () => {
    const { runSecurityAutoScan } =
      await import("../src/security/security-overview/auto-scan.js");
    const result = await runSecurityAutoScan({
      repoPath: tmpDir,
      imageRef: "ubuntu:22.04",
    });
    expect(result.ok).toBe(true);
    expect(autoScanMocks.runTrivyImage).toHaveBeenCalledWith("ubuntu:22.04");
    expect(result.risksImageResult).toEqual({ findings: [] });
  });

  it("line 68: imageRef empty string → runTrivyImage NOT called, risksImageResult is null", async () => {
    const { runSecurityAutoScan } =
      await import("../src/security/security-overview/auto-scan.js");
    const result = await runSecurityAutoScan({
      repoPath: tmpDir,
      imageRef: "",
    });
    expect(result.ok).toBe(true);
    expect(autoScanMocks.runTrivyImage).not.toHaveBeenCalled();
    expect(result.risksImageResult).toBeNull();
  });

  it("line 68 .catch: runTrivyImage throws → risksImageResult falls back to null", async () => {
    autoScanMocks.runTrivyImage.mockRejectedValue(new Error("trivy failed"));
    const { runSecurityAutoScan } =
      await import("../src/security/security-overview/auto-scan.js");
    const result = await runSecurityAutoScan({
      repoPath: tmpDir,
      imageRef: "bad-image:latest",
    });
    expect(result.ok).toBe(true);
    expect(result.risksImageResult).toBeNull();
  });

  it("line 72 .catch: runSecretsScan throws → secretsResult falls back to {findings:[]}", async () => {
    autoScanMocks.runSecretsScan.mockRejectedValue(new Error("secrets scan failed"));
    const { runSecurityAutoScan } =
      await import("../src/security/security-overview/auto-scan.js");
    const result = await runSecurityAutoScan({ repoPath: tmpDir });
    expect(result.ok).toBe(true);
    expect((result.secretsResult as any).findings).toEqual([]);
  });

  it("line 76 .catch: runDependencyCheck throws → risksDependencyResult falls back to {findings:[]}", async () => {
    autoScanMocks.runDependencyCheck.mockRejectedValue(new Error("dep check failed"));
    const { runSecurityAutoScan } =
      await import("../src/security/security-overview/auto-scan.js");
    const result = await runSecurityAutoScan({ repoPath: tmpDir });
    expect(result.ok).toBe(true);
    expect((result.risksDependencyResult as any).findings).toEqual([]);
  });

  it("line 76: triagePath provided → loadSecurityTriage is called", async () => {
    const { runSecurityAutoScan } =
      await import("../src/security/security-overview/auto-scan.js");
    const triagePath = path.join(tmpDir, "triage.json");
    fs.writeFileSync(triagePath, JSON.stringify([
      { fingerprint: "fp1", status: "accepted", updatedAt: Date.now() },
    ]));
    const result = await runSecurityAutoScan({
      repoPath: tmpDir,
      triagePath,
    });
    expect(result.ok).toBe(true);
  });

  it("lines 121-127: drift classification + history append with introduced findings", async () => {
    const { runSecurityAutoScan } =
      await import("../src/security/security-overview/auto-scan.js");
    // Baseline has one finding; secrets scan returns a new finding → introduced
    autoScanMocks.runSecretsScan.mockResolvedValue({
      findings: [{ path: "src/app.ts", type: "secret", message: "key" }],
    });
    const baselinePath = path.join(tmpDir, "baseline2.json");
    const driftHistoryPath = path.join(tmpDir, "drift-history2.json");
    fs.writeFileSync(baselinePath, JSON.stringify({
      findings: [{ path: "src/old.ts", type: "secret", message: "old" }],
    }));
    const result = await runSecurityAutoScan({
      workspaceId: "ws-drift",
      repoPath: tmpDir,
      baselinePath,
      driftHistoryPath,
    });
    expect(result.ok).toBe(true);
    expect(result.drift?.introduced.length).toBeGreaterThan(0);
    expect(result.driftHistoryAppend).toBeDefined();
    expect(result.driftHistoryAppend?.filePath).toBe(driftHistoryPath);
  });

  it("lines 121-127: drift classification 'improved' when only resolved findings", async () => {
    const { runSecurityAutoScan } =
      await import("../src/security/security-overview/auto-scan.js");
    // Baseline has a finding, current scan returns nothing → resolved (improved)
    autoScanMocks.runSecretsScan.mockResolvedValue({ findings: [] });
    autoScanMocks.runDependencyCheck.mockResolvedValue({ findings: [] });
    const baselinePath = path.join(tmpDir, "baseline3.json");
    const driftHistoryPath = path.join(tmpDir, "drift-history3.json");
    fs.writeFileSync(baselinePath, JSON.stringify({
      findings: [{ path: "src/old.ts", type: "secret", message: "old" }],
    }));
    const result = await runSecurityAutoScan({
      workspaceId: "ws-improved",
      repoPath: tmpDir,
      baselinePath,
      driftHistoryPath,
    });
    expect(result.ok).toBe(true);
    expect(result.drift?.resolved.length).toBeGreaterThan(0);
    expect(result.driftHistoryAppend).toBeDefined();
  });

  it("line 171: catch block — returns ok=false with error when driftHistoryPath is a directory (fs.writeFileSync throws)", async () => {
    // appendDriftHistory → saveDriftHistory → fs.writeFileSync throws if path is a directory
    // This is NOT caught by individual .catch() guards, so it propagates to the outer catch
    const { runSecurityAutoScan } =
      await import("../src/security/security-overview/auto-scan.js");
    const baselinePath = path.join(tmpDir, "bl-err.json");
    fs.writeFileSync(baselinePath, JSON.stringify({ findings: [] }));
    // Pass a directory (not a file) as driftHistoryPath — writeFileSync will throw EISDIR
    const result = await runSecurityAutoScan({
      repoPath: tmpDir,
      baselinePath,
      driftHistoryPath: tmpDir, // tmpDir is a directory → EISDIR
    });
    expect(result.ok).toBe(false);
    expect(typeof result.error).toBe("string");
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// baseline.ts — line 16 (item.fingerprint is falsy → not added to set)
//               line 24 (items have no fingerprint key at all)
// ─────────────────────────────────────────────────────────────────────────────
describe("baseline — uncovered branches", () => {
  it("line 16: items with empty/null fingerprint are skipped", async () => {
    const { loadSecurityBaseline } =
      await import("../src/security/security-overview/baseline.js");
    const tmp = path.join(os.tmpdir(), `bl-empty-fp-${Date.now()}.json`);
    fs.writeFileSync(tmp, JSON.stringify({
      generatedAt: Date.now(),
      findings: [
        { fingerprint: "" },
        { fingerprint: null },
        { fingerprint: "valid-fp" },
      ],
    }));
    const set = loadSecurityBaseline(tmp);
    expect(set.has("valid-fp")).toBe(true);
    expect(set.size).toBe(1); // empty + null skipped
    fs.unlinkSync(tmp);
  });

  it("line 24: parsed is a plain object without findings array → returns empty set", async () => {
    const { loadSecurityBaseline } =
      await import("../src/security/security-overview/baseline.js");
    const tmp = path.join(os.tmpdir(), `bl-obj-${Date.now()}.json`);
    // Not an array, not a {findings:[]} object
    fs.writeFileSync(tmp, JSON.stringify({ generatedAt: 123, meta: "stuff" }));
    const set = loadSecurityBaseline(tmp);
    expect(set.size).toBe(0);
    fs.unlinkSync(tmp);
  });

  it("line 24: parsed is a primitive (string JSON) → returns empty set", async () => {
    const { loadSecurityBaseline } =
      await import("../src/security/security-overview/baseline.js");
    const tmp = path.join(os.tmpdir(), `bl-str-${Date.now()}.json`);
    fs.writeFileSync(tmp, '"just a string"');
    const set = loadSecurityBaseline(tmp);
    expect(set.size).toBe(0);
    fs.unlinkSync(tmp);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// drift.ts — line 38 (summarizeBySeverity: severity not in out → out.unknown++)
//             line 84 (pushWithResolvedAt: resolvedAt already set → skip assignment)
//             lines 172-174 (classifyDriftSeverity: mixed branch)
// ─────────────────────────────────────────────────────────────────────────────
describe("drift — uncovered branches", () => {
  it("line 84: loadSecurityBaselineSnapshot returns null for invalid JSON file (catch branch)", async () => {
    const { loadSecurityBaselineSnapshot } =
      await import("../src/security/security-overview/drift.js");
    const tmp = path.join(os.tmpdir(), `drift-bad-json-${Date.now()}.json`);
    fs.writeFileSync(tmp, "{ invalid json ]");
    const result = loadSecurityBaselineSnapshot(tmp);
    expect(result).toBeNull();
    fs.unlinkSync(tmp);
  });

  it("line 84: loadSecurityBaselineSnapshot returns null when JSON is a primitive", async () => {
    const { loadSecurityBaselineSnapshot } =
      await import("../src/security/security-overview/drift.js");
    const tmp = path.join(os.tmpdir(), `drift-prim-${Date.now()}.json`);
    fs.writeFileSync(tmp, '"just a string"');
    const result = loadSecurityBaselineSnapshot(tmp);
    expect(result).toBeNull();
    fs.unlinkSync(tmp);
  });

  it("line 38: unknown severity string falls into out.unknown bucket", async () => {
    const { compareSecurityOverviewWithBaseline } =
      await import("../src/security/security-overview/drift.js");
    const current = {
      findings: [{ fingerprint: "fp-weird", severity: "catastrophic" }],
    };
    const result = compareSecurityOverviewWithBaseline(current, { findings: [] });
    expect(result.bySeverity.introduced.unknown).toBe(1);
  });

  it("line 84: pushWithResolvedAt skips setting resolvedAt when it already exists", async () => {
    const { compareSecurityOverviewWithBaseline } =
      await import("../src/security/security-overview/drift.js");
    const baseline = {
      findings: [
        { fingerprint: "fp-old", severity: "high", resolvedAt: "2024-01-01T00:00:00.000Z" },
      ],
    };
    const result = compareSecurityOverviewWithBaseline({ findings: [] }, baseline);
    expect(result.resolved).toHaveLength(1);
    // resolvedAt should NOT have been overwritten
    expect(result.resolved[0].resolvedAt).toBe("2024-01-01T00:00:00.000Z");
  });

  it("lines 172-174: classifyDriftSeverity returns 'mixed' when both introduced and resolved", async () => {
    const { classifyDriftSeverity } =
      await import("../src/security/security-overview/drift.js");
    const result = classifyDriftSeverity({
      introduced: [{ fingerprint: "new" }],
      resolved: [{ fingerprint: "old" }],
      persistent: [],
    });
    expect(result).toBe("mixed");
  });

  it("classifyDriftSeverity returns 'clean' when no introduced or resolved", async () => {
    const { classifyDriftSeverity } =
      await import("../src/security/security-overview/drift.js");
    expect(classifyDriftSeverity({ introduced: [], resolved: [], persistent: [] }))
      .toBe("clean");
  });

  it("classifyDriftSeverity returns 'regressed' when only introduced", async () => {
    const { classifyDriftSeverity } =
      await import("../src/security/security-overview/drift.js");
    expect(classifyDriftSeverity({ introduced: [{}], resolved: [], persistent: [] }))
      .toBe("regressed");
  });

  it("classifyDriftSeverity returns 'improved' when only resolved", async () => {
    const { classifyDriftSeverity } =
      await import("../src/security/security-overview/drift.js");
    expect(classifyDriftSeverity({ introduced: [], resolved: [{}], persistent: [] }))
      .toBe("improved");
  });

  it("line 84: pushWithTriageStatus skips setting triageStatus when it already exists", async () => {
    const { compareSecurityOverviewWithBaseline } =
      await import("../src/security/security-overview/drift.js");
    // introduced finding already has triageStatus set
    const current = {
      findings: [{ fingerprint: "fp-new", severity: "low", triageStatus: "accepted" }],
    };
    const result = compareSecurityOverviewWithBaseline(current, { findings: [] });
    expect(result.introduced).toHaveLength(1);
    expect(result.introduced[0].triageStatus).toBe("accepted");
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// drift-history.ts — lines 35-39 (loadDriftHistory: parses a non-array → [])
// ─────────────────────────────────────────────────────────────────────────────
describe("drift-history — uncovered branches", () => {
  it("lines 35-39: loadDriftHistory returns [] when file contains a JSON object (not array)", async () => {
    const { loadDriftHistory } =
      await import("../src/security/security-overview/drift-history.js");
    const tmp = path.join(os.tmpdir(), `dh-obj-${Date.now()}.json`);
    fs.writeFileSync(tmp, JSON.stringify({ entry: "single object" }));
    const result = loadDriftHistory(tmp);
    expect(result).toEqual([]);
    fs.unlinkSync(tmp);
  });

  it("lines 35-39: loadDriftHistory returns [] for invalid JSON", async () => {
    const { loadDriftHistory } =
      await import("../src/security/security-overview/drift-history.js");
    const tmp = path.join(os.tmpdir(), `dh-bad-${Date.now()}.json`);
    fs.writeFileSync(tmp, "{ bad json ]");
    const result = loadDriftHistory(tmp);
    expect(result).toEqual([]);
    fs.unlinkSync(tmp);
  });

  it("loadDriftHistory returns [] for null/undefined/empty path", async () => {
    const { loadDriftHistory } =
      await import("../src/security/security-overview/drift-history.js");
    expect(loadDriftHistory(null)).toEqual([]);
    expect(loadDriftHistory(undefined)).toEqual([]);
    expect(loadDriftHistory("")).toEqual([]);
    expect(loadDriftHistory("   ")).toEqual([]);
  });

  it("saveDriftHistory and appendDriftHistory round-trip", async () => {
    const { saveDriftHistory, appendDriftHistory, loadDriftHistory } =
      await import("../src/security/security-overview/drift-history.js");
    const tmp = path.join(os.tmpdir(), `dh-rt-${Date.now()}.json`);
    const entry = {
      id: "e1", createdAt: 1000, classification: "clean" as const,
    };
    const r1 = saveDriftHistory(tmp, [entry]);
    expect(r1.ok).toBe(true);
    expect(r1.count).toBe(1);

    const entry2 = { id: "e2", createdAt: 2000, classification: "regressed" as const };
    const r2 = appendDriftHistory(tmp, entry2);
    expect(r2.count).toBe(2);

    const loaded = loadDriftHistory(tmp);
    expect(loaded).toHaveLength(2);
    expect(loaded[1].id).toBe("e2");
    fs.unlinkSync(tmp);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// normalizer.ts — lines 11-15 (normalizeSeverity: moderate→medium, info/informational/note→info)
//                 line 38 (asTrimmedString: empty string after trim → returns undefined)
//                 line 53 (flattenFindings: ruleId fallback is "unknown-rule" → undefined in output)
// ─────────────────────────────────────────────────────────────────────────────
describe("normalizer — uncovered branches", () => {
  it("lines 11-12: 'moderate' severity normalises to 'medium'", async () => {
    const { flattenFindings } =
      await import("../src/security/security-overview/normalizer.js");
    const result = flattenFindings(
      [{ ruleId: "R1", severity: "moderate", fingerprint: "fp1" }],
      "risk",
    );
    expect(result[0].severity).toBe("medium");
  });

  it("lines 13-14: 'informational' severity normalises to 'info'", async () => {
    const { flattenFindings } =
      await import("../src/security/security-overview/normalizer.js");
    const result = flattenFindings(
      [{ ruleId: "R1", severity: "informational", fingerprint: "fp2" }],
      "risk",
    );
    expect(result[0].severity).toBe("info");
  });

  it("lines 13-14: 'note' severity normalises to 'info'", async () => {
    const { flattenFindings } =
      await import("../src/security/security-overview/normalizer.js");
    const result = flattenFindings(
      [{ ruleId: "R1", severity: "note", fingerprint: "fp3" }],
      "risk",
    );
    expect(result[0].severity).toBe("info");
  });

  it("line 15: completely unrecognised severity → 'unknown'", async () => {
    const { flattenFindings } =
      await import("../src/security/security-overview/normalizer.js");
    const result = flattenFindings(
      [{ ruleId: "R1", severity: "catastrophic", fingerprint: "fp4" }],
      "risk",
    );
    expect(result[0].severity).toBe("unknown");
  });

  it("line 38: asTrimmedString with whitespace-only string returns empty string (via title field)", async () => {
    const { flattenFindings } =
      await import("../src/security/security-overview/normalizer.js");
    // title = "   " → asTrimmedString trims to "" and returns "" (trimmed ?? undefined → "" since "" is not null/undefined)
    const result = flattenFindings(
      [{ ruleId: "R-ws", severity: "low", title: "   ", fingerprint: "fp5" }],
      "secret",
    );
    // asTrimmedString returns "" for whitespace-only; "" ?? undefined → "" (not undefined)
    expect(result[0].title).toBe("");
  });

  it("line 53: ruleId missing → ruleId field is undefined in output, fallback fingerprint built", async () => {
    const { flattenFindings } =
      await import("../src/security/security-overview/normalizer.js");
    const result = flattenFindings(
      [{ severity: "high", file: "app.ts" }],
      "secret",
    );
    // ruleId was "unknown-rule" internally → omitted from output
    expect(result[0].ruleId).toBeUndefined();
    // fingerprint should be built from fallback
    expect(result[0].fingerprint).toBeDefined();
  });

  it("line 53: flattenFindings handles payload as {findings:[]} object (branch coverage)", async () => {
    const { flattenFindings } =
      await import("../src/security/security-overview/normalizer.js");
    // payload is an object wrapping findings — covers line 53
    const result = flattenFindings(
      { findings: [{ ruleId: "SEC-001", severity: "high", fingerprint: "fp-wrapped" }] },
      "risk",
    );
    expect(result).toHaveLength(1);
    expect(result[0].fingerprint).toBe("fp-wrapped");
    expect(result[0].severity).toBe("high");
  });

  it("normalizeTriageStatus: valid statuses pass through, invalid → 'open'", async () => {
    const { normalizeTriageStatus } =
      await import("../src/security/security-overview/normalizer.js");
    expect(normalizeTriageStatus("accepted")).toBe("accepted");
    expect(normalizeTriageStatus("false_positive")).toBe("false_positive");
    expect(normalizeTriageStatus("garbage")).toBe("open");
    expect(normalizeTriageStatus("")).toBe("open");
    expect(normalizeTriageStatus(null)).toBe("open");
    expect(normalizeTriageStatus(42)).toBe("open");
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// suppressions.ts — line 43: kind mismatch (s.kind !== "any" && s.kind !== finding.kind)
// ─────────────────────────────────────────────────────────────────────────────
describe("suppressions — uncovered branch (line 43)", () => {
  it("line 43: skips suppression when kind mismatches and is not 'any'", async () => {
    const { isSecuritySuppressed } =
      await import("../src/security/security-overview/suppressions.js");
    // suppression is for 'risk', finding is a 'secret' → should NOT be suppressed
    const suppressions = [
      { kind: "risk" as const, fingerprint: "fp-x" },
    ];
    const result = isSecuritySuppressed(
      { fingerprint: "fp-x", kind: "secret" },
      suppressions,
    );
    expect(result).toBe(false);
  });

  it("line 43: kind='any' still matches regardless of finding kind", async () => {
    const { isSecuritySuppressed } =
      await import("../src/security/security-overview/suppressions.js");
    const suppressions = [{ kind: "any" as const, fingerprint: "fp-any" }];
    expect(isSecuritySuppressed({ fingerprint: "fp-any", kind: "secret" }, suppressions))
      .toBe(true);
    expect(isSecuritySuppressed({ fingerprint: "fp-any", kind: "risk" }, suppressions))
      .toBe(true);
  });

  it("finding has no kind → suppression with kind is still evaluated by fingerprint", async () => {
    const { isSecuritySuppressed } =
      await import("../src/security/security-overview/suppressions.js");
    // s.kind = "risk", finding.kind = undefined → condition is:
    // s.kind && s.kind !== "any" && finding.kind && s.kind !== finding.kind
    // finding.kind is falsy → skips the kind check → proceeds to fingerprint check
    const suppressions = [{ kind: "risk" as const, fingerprint: "fp-nk" }];
    const result = isSecuritySuppressed({ fingerprint: "fp-nk" }, suppressions);
    expect(result).toBe(true);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// triage.ts — lines 68-94 (isTriageStatusFinal, applyBulkTriage)
// ─────────────────────────────────────────────────────────────────────────────
describe("triage — uncovered lines 68-94", () => {
  it("line 68: isTriageStatusFinal returns true for 'fixed'", async () => {
    const { isTriageStatusFinal } =
      await import("../src/security/security-overview/triage.js");
    expect(isTriageStatusFinal("fixed" as any)).toBe(true);
  });

  it("line 68: isTriageStatusFinal returns true for 'resolved'", async () => {
    const { isTriageStatusFinal } =
      await import("../src/security/security-overview/triage.js");
    expect(isTriageStatusFinal("resolved" as any)).toBe(true);
  });

  it("line 68: isTriageStatusFinal returns true for 'suppressed'", async () => {
    const { isTriageStatusFinal } =
      await import("../src/security/security-overview/triage.js");
    expect(isTriageStatusFinal("suppressed" as any)).toBe(true);
  });

  it("line 68: isTriageStatusFinal returns false for 'open'", async () => {
    const { isTriageStatusFinal } =
      await import("../src/security/security-overview/triage.js");
    expect(isTriageStatusFinal("open" as any)).toBe(false);
  });

  it("line 68: isTriageStatusFinal returns false for 'accepted'", async () => {
    const { isTriageStatusFinal } =
      await import("../src/security/security-overview/triage.js");
    expect(isTriageStatusFinal("accepted" as any)).toBe(false);
  });

  it("lines 78-94: applyBulkTriage applies status to multiple fingerprints", async () => {
    const { applyBulkTriage } =
      await import("../src/security/security-overview/triage.js");
    const entries = [
      { fingerprint: "fp-1", status: "open" as any, updatedAt: 1 },
    ];
    const result = applyBulkTriage(
      entries,
      ["fp-1", "fp-2", "fp-3"],
      "accepted" as any,
      "bulk accept",
      "admin",
      9999,
    );
    expect(result).toHaveLength(3);
    const fp1 = result.find((e) => e.fingerprint === "fp-1");
    const fp2 = result.find((e) => e.fingerprint === "fp-2");
    expect(fp1?.status).toBe("accepted");
    expect(fp1?.reason).toBe("bulk accept");
    expect(fp1?.updatedBy).toBe("admin");
    expect(fp1?.updatedAt).toBe(9999);
    expect(fp2?.status).toBe("accepted");
    expect(fp2?.fingerprint).toBe("fp-2");
  });

  it("lines 78-94: applyBulkTriage skips null, undefined, and empty fingerprints", async () => {
    const { applyBulkTriage } =
      await import("../src/security/security-overview/triage.js");
    const entries: any[] = [];
    const result = applyBulkTriage(
      entries,
      [null, undefined, "", "   ", "valid-fp"],
      "resolved" as any,
    );
    // Only "valid-fp" should be added; whitespace-only is trimmed to "" and skipped
    expect(result).toHaveLength(1);
    expect(result[0].fingerprint).toBe("valid-fp");
  });

  it("lines 78-94: applyBulkTriage returns original entries for empty fingerprints array", async () => {
    const { applyBulkTriage } =
      await import("../src/security/security-overview/triage.js");
    const entries = [{ fingerprint: "fp-1", status: "open" as any, updatedAt: 1 }];
    const result = applyBulkTriage(entries, [], "resolved" as any);
    expect(result).toBe(entries); // same reference — no mutation
  });

  it("lines 78-94: applyBulkTriage returns original entries for non-array input", async () => {
    const { applyBulkTriage } =
      await import("../src/security/security-overview/triage.js");
    const entries = [{ fingerprint: "fp-1", status: "open" as any, updatedAt: 1 }];
    const result = applyBulkTriage(entries, null as any, "resolved" as any);
    expect(result).toBe(entries);
  });

  it("applyBulkTriage without reason/updatedBy leaves those fields undefined", async () => {
    const { applyBulkTriage } =
      await import("../src/security/security-overview/triage.js");
    const result = applyBulkTriage([], ["fp-x"], "accepted" as any);
    expect(result[0].reason).toBeUndefined();
    expect(result[0].updatedBy).toBeUndefined();
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// index.ts — 0% coverage
// The barrel imports all sub-modules; we exercise each exported name to ensure
// the module itself is loaded and its re-export lines are instrumented.
// ─────────────────────────────────────────────────────────────────────────────
describe("index.ts barrel — 0% → covered", () => {
  it("exports all expected names and they are callable/truthy", async () => {
    const barrel = await import("../src/security/security-overview/index.js");

    // schema
    expect(barrel.emptySecurityOverviewSnapshot).toBeDefined();
    expect(typeof barrel.buildSecurityOverviewSnapshot).toBe("function");
    expect(Array.isArray(barrel.TRIAGE_STATUSES)).toBe(true);
    expect(barrel.securityOverviewSchema).toBeDefined();

    // baseline
    expect(typeof barrel.loadSecurityBaseline).toBe("function");
    expect(typeof barrel.saveSecurityBaseline).toBe("function");
    expect(barrel.loadBaseline).toBe(barrel.loadSecurityBaseline);

    // suppressions
    expect(typeof barrel.loadSecuritySuppressions).toBe("function");
    expect(typeof barrel.saveSecuritySuppressions).toBe("function");
    expect(typeof barrel.isSecuritySuppressed).toBe("function");
    expect(barrel.loadSuppressions).toBe(barrel.loadSecuritySuppressions);
    expect(barrel.isSuppressed).toBe(barrel.isSecuritySuppressed);

    // normalizer
    expect(typeof barrel.flattenFindings).toBe("function");
    expect(typeof barrel.normalizeTriageStatus).toBe("function");
    expect(barrel.normalizeFinding).toBe(barrel.flattenFindings);

    // triage
    expect(typeof barrel.loadSecurityTriage).toBe("function");
    expect(typeof barrel.saveSecurityTriage).toBe("function");
    expect(typeof barrel.upsertSecurityTriageEntry).toBe("function");
    expect(typeof barrel.getSecurityTriageStatus).toBe("function");
    expect(typeof barrel.isTriageStatusFinal).toBe("function");
    expect(typeof barrel.applyBulkTriage).toBe("function");
    expect(barrel.triageFinding).toBe(barrel.upsertSecurityTriageEntry);

    // drift
    expect(typeof barrel.loadSecurityBaselineSnapshot).toBe("function");
    expect(typeof barrel.buildFindingFingerprintSet).toBe("function");
    expect(typeof barrel.compareSecurityOverviewWithBaseline).toBe("function");
    expect(barrel.detectDrift).toBe(barrel.compareSecurityOverviewWithBaseline);
    expect(typeof barrel.classifyDriftSeverity).toBe("function");

    // ai-explain
    expect(typeof barrel.buildIntroducedFindingsPrompt).toBe("function");
    expect(typeof barrel.parseExplainIntroducedFindingsAnswer).toBe("function");
    expect(typeof barrel.explainIntroducedFindings).toBe("function");
    expect(barrel.explainWithAI).toBe(barrel.explainIntroducedFindings);

    // drift-history
    expect(typeof barrel.loadDriftHistory).toBe("function");
    expect(typeof barrel.saveDriftHistory).toBe("function");
    expect(typeof barrel.appendDriftHistory).toBe("function");

    // auto-scan
    expect(typeof barrel.runSecurityAutoScan).toBe("function");
    expect(barrel.runAutoScan).toBe(barrel.runSecurityAutoScan);
  });

  it("barrel functions are actually the same implementations as direct imports", async () => {
    const barrel = await import("../src/security/security-overview/index.js");
    const direct = await import("../src/security/security-overview/baseline.js");
    expect(barrel.loadSecurityBaseline).toBe(direct.loadSecurityBaseline);
  });
});
