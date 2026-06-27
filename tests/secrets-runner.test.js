import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";

// ---------------------------------------------------------------------------
// Mocks — hoisted above all imports by Vitest.
//
// CRITICAL: These must be synchronous factories (no async) for reliable
// hoisting in all Vitest versions. The async (importOriginal) pattern can
// silently fail to hoist on some versions, causing the real spawn/readFile
// to be called instead of the mock — which produces "spawn gitleaks ENOENT".
//
// We don't need importOriginal here: we only need to intercept spawn,
// readFile, and rm. Everything else in those modules is irrelevant to tests.
// ---------------------------------------------------------------------------
vi.mock("node:child_process", () => {
  const spawn = vi.fn();
  return {
    spawn,
    default: { spawn },
  };
});

vi.mock("node:fs/promises", () => {
  const readFile = vi.fn();
  const rm = vi.fn();
  const writeFile = vi.fn();
  return {
    readFile,
    rm,
    writeFile,
    // some import paths resolve via default export rather than named
    // bindings — same fix pattern as the node:child_process mock
    default: { readFile, rm, writeFile },
  };
});

vi.mock("../src/security/secrets/baseline.js", () => ({
  loadBaselineFingerprints: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports — resolved AFTER the mock registry is populated.
// ---------------------------------------------------------------------------
import { spawn } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import * as baselineModule from "../src/security/secrets/baseline.js";
import {
  loadSuppressions,
  matchSuppression,
} from "../src/security/secrets/suppressions.js";
import { runSecretsScan } from "../src/security/secrets/gitleaks-runner.js";

const spawnMock = vi.mocked(spawn);
const readFileMock = vi.mocked(readFile);
const rmMock = vi.mocked(rm);

// ---------------------------------------------------------------------------
// Helper: fake child process whose events fire after the promise chain
// has attached its listeners (setTimeout 0 gives the event loop one tick).
// ---------------------------------------------------------------------------
function makeFakeChild({
  stdout = "",
  stderr = "",
  code = 0,
  emitError = null,
} = {}) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  setTimeout(() => {
    if (emitError) {
      child.emit("error", emitError);
      return;
    }
    if (stdout) child.stdout.emit("data", Buffer.from(stdout));
    if (stderr) child.stderr.emit("data", Buffer.from(stderr));
    child.emit("close", code);
  }, 0);
  return child;
}

// ---------------------------------------------------------------------------
// baseline — uses vi.importActual so we test the real implementation
// while readFile is still the vi.fn() mock above.
// ---------------------------------------------------------------------------
describe("baseline — loadBaselineFingerprints", () => {
  let loadBaselineFingerprints;

  beforeEach(async () => {
    const actual = await vi.importActual("../src/security/secrets/baseline.js");
    loadBaselineFingerprints = actual.loadBaselineFingerprints;
    readFileMock.mockReset();
    rmMock.mockResolvedValue(undefined);
  });

  afterEach(() => vi.clearAllMocks());

  it("returns empty set when baselinePath is null", async () => {
    const out = await loadBaselineFingerprints(null);
    expect(out.size).toBe(0);
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it("returns empty set when baselinePath is undefined", async () => {
    expect((await loadBaselineFingerprints(undefined)).size).toBe(0);
  });

  it("returns empty set when baselinePath is empty string", async () => {
    expect((await loadBaselineFingerprints("")).size).toBe(0);
  });

  it("loads fingerprints from flat array (PascalCase + camelCase keys)", async () => {
    readFileMock.mockResolvedValueOnce(
      JSON.stringify([{ Fingerprint: "abc" }, { fingerprint: "def" }]),
    );
    const out = await loadBaselineFingerprints("/baseline.json");
    expect(out.has("abc")).toBe(true);
    expect(out.has("def")).toBe(true);
  });

  it("extracts fingerprints from a { findings: [...] } wrapper", async () => {
    readFileMock.mockResolvedValueOnce(
      JSON.stringify({
        findings: [
          { Fingerprint: "wrapped-fp" },
          { fingerprint: "wrapped-lower" },
        ],
      }),
    );
    const out = await loadBaselineFingerprints("/baseline-wrapped.json");
    expect(out.has("wrapped-fp")).toBe(true);
    expect(out.has("wrapped-lower")).toBe(true);
  });

  it("returns empty set when readFile rejects (catch branch)", async () => {
    readFileMock.mockRejectedValueOnce(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
    );
    expect((await loadBaselineFingerprints("/nonexistent.json")).size).toBe(0);
  });

  it("returns empty set when JSON.parse throws (catch branch)", async () => {
    readFileMock.mockResolvedValueOnce("not-valid-json{{{");
    expect((await loadBaselineFingerprints("/bad.json")).size).toBe(0);
  });

  it("skips entries without a fingerprint field", async () => {
    readFileMock.mockResolvedValueOnce(
      JSON.stringify([{ RuleID: "some-rule" }, { Fingerprint: "valid-fp" }]),
    );
    const out = await loadBaselineFingerprints("/partial.json");
    expect(out.has("valid-fp")).toBe(true);
    expect(out.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// suppressions — loadSuppressions
// ---------------------------------------------------------------------------
describe("suppressions — loadSuppressions", () => {
  beforeEach(() => {
    readFileMock.mockReset();
    rmMock.mockResolvedValue(undefined);
  });

  afterEach(() => vi.clearAllMocks());

  it("returns [] when suppressionsPath is null", async () => {
    expect(await loadSuppressions(null)).toEqual([]);
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it("returns [] when suppressionsPath is undefined", async () => {
    expect(await loadSuppressions(undefined)).toEqual([]);
  });

  it("returns [] when suppressionsPath is empty string", async () => {
    expect(await loadSuppressions("")).toEqual([]);
  });

  it("reads and parses a valid suppressions file", async () => {
    const data = [{ fingerprint: "fp-1", reason: "known" }];
    readFileMock.mockResolvedValueOnce(JSON.stringify(data));
    const result = await loadSuppressions("/some/path.json");
    expect(result).toHaveLength(1);
    expect(result[0].fingerprint).toBe("fp-1");
  });

  it("returns [] when file content is not an array", async () => {
    readFileMock.mockResolvedValueOnce(JSON.stringify({ notArray: true }));
    expect(await loadSuppressions("/some/path.json")).toEqual([]);
  });

  it("returns [] when readFile rejects", async () => {
    readFileMock.mockRejectedValueOnce(new Error("ENOENT"));
    expect(await loadSuppressions("/missing.json")).toEqual([]);
  });

  it("returns [] when JSON.parse throws", async () => {
    readFileMock.mockResolvedValueOnce("not-json");
    expect(await loadSuppressions("/bad.json")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// suppressions — matchSuppression
// ---------------------------------------------------------------------------
describe("suppressions — matchSuppression", () => {
  const base = {
    id: "x",
    ruleId: "r1",
    file: "a.js",
    fingerprint: "fp-1",
    severity: "low",
    category: "unknown",
    description: "",
    startLine: 1,
    endLine: 1,
    startColumn: 0,
    endColumn: 0,
    commit: null,
    author: null,
    email: null,
    date: null,
    secretPreview: null,
    match: null,
    tags: [],
    baselineMatched: false,
    suppressed: false,
    suppressionReason: null,
  };

  it("returns null for empty suppressions", () => {
    expect(matchSuppression(base, [])).toBeNull();
  });

  it("matches by fingerprint", () => {
    const sup = { fingerprint: "fp-1", reason: "test" };
    expect(matchSuppression(base, [sup])).toBe(sup);
  });

  it("matches by file + ruleId", () => {
    const sup = { file: "a.js", ruleId: "r1", reason: "file-rule" };
    expect(matchSuppression({ ...base, fingerprint: "other" }, [sup])).toBe(
      sup,
    );
  });

  it("returns null when fingerprint differs and file/ruleId differ", () => {
    expect(
      matchSuppression(base, [{ fingerprint: "fp-other", reason: "no" }]),
    ).toBeNull();
  });

  it("does not match when only file matches (ruleId absent)", () => {
    expect(
      matchSuppression(base, [{ file: "a.js", reason: "partial" }]),
    ).toBeNull();
  });

  it("does not match when only ruleId matches (file absent)", () => {
    expect(
      matchSuppression(base, [{ ruleId: "r1", reason: "partial" }]),
    ).toBeNull();
  });

  it("returns first match when multiple suppressions match", () => {
    const sup1 = { fingerprint: "fp-1", reason: "first" };
    const sup2 = { fingerprint: "fp-1", reason: "second" };
    expect(matchSuppression(base, [sup1, sup2])).toBe(sup1);
  });
});

// ---------------------------------------------------------------------------
// gitleaks-runner — runSecretsScan
// ---------------------------------------------------------------------------
describe("gitleaks-runner — runSecretsScan", () => {
  let baselineMock;

  beforeEach(() => {
    spawnMock.mockReset();
    readFileMock.mockReset();
    rmMock.mockResolvedValue(undefined);
    baselineMock = vi.mocked(baselineModule.loadBaselineFingerprints);
    baselineMock.mockResolvedValue(new Set());
  });

  afterEach(() => vi.clearAllMocks());

  // -------------------------------------------------------------------------
  // runCommand paths
  // -------------------------------------------------------------------------
  it("resolves with ok:true and empty findings when gitleaks exits code 0", async () => {
    spawnMock.mockReturnValue(makeFakeChild({ code: 0 }));
    readFileMock.mockRejectedValueOnce(new Error("ENOENT"));

    const result = await runSecretsScan({ repoPath: "/repo" });
    expect(result.ok).toBe(true);
    expect(result.engine).toBe("gitleaks");
    expect(result.findings).toHaveLength(0);
  });

  it("resolves when gitleaks exits code 1 (findings present, not an error)", async () => {
    spawnMock.mockReturnValue(makeFakeChild({ code: 1 }));
    readFileMock.mockRejectedValueOnce(new Error("ENOENT"));
    expect((await runSecretsScan({ repoPath: "/repo" })).ok).toBe(true);
  });

  it("resolves using stderr when stdout is empty", async () => {
    spawnMock.mockReturnValue(
      makeFakeChild({ stdout: "", stderr: "[]", code: 0 }),
    );
    readFileMock.mockRejectedValueOnce(new Error("ENOENT"));
    expect((await runSecretsScan({ repoPath: "/repo" })).ok).toBe(true);
  });

  it("rejects when gitleaks exits with code 2", async () => {
    spawnMock.mockReturnValue(
      makeFakeChild({ stderr: "fatal error", code: 2 }),
    );
    await expect(runSecretsScan({ repoPath: "/repo" })).rejects.toThrow(
      "gitleaks exited with code 2",
    );
  });

  it("rejects when spawn emits error event", async () => {
    spawnMock.mockReturnValue(
      makeFakeChild({ emitError: new Error("spawn-sentinel") }),
    );
    await expect(runSecretsScan({ repoPath: "/repo" })).rejects.toThrow(
      "spawn-sentinel",
    );
  });

  // -------------------------------------------------------------------------
  // Option branches
  // -------------------------------------------------------------------------
  it("adds --config arg when configPath is provided", async () => {
    spawnMock.mockReturnValue(makeFakeChild({ code: 0 }));
    readFileMock.mockRejectedValueOnce(new Error("ENOENT"));

    await runSecretsScan({
      repoPath: "/repo",
      configPath: "/my/.gitleaks.toml",
    });

    const args = spawnMock.mock.calls[0][1];
    expect(args).toContain("--config");
    expect(args).toContain("/my/.gitleaks.toml");
  });

  it("does not add --config when configPath is null", async () => {
    spawnMock.mockReturnValue(makeFakeChild({ code: 0 }));
    readFileMock.mockRejectedValueOnce(new Error("ENOENT"));

    await runSecretsScan({ repoPath: "/repo", configPath: null });
    expect(spawnMock.mock.calls[0][1]).not.toContain("--config");
  });

  it("adds --redact when redact is true", async () => {
    spawnMock.mockReturnValue(makeFakeChild({ code: 0 }));
    readFileMock.mockRejectedValueOnce(new Error("ENOENT"));

    await runSecretsScan({ repoPath: "/repo", redact: true });
    expect(spawnMock.mock.calls[0][1]).toContain("--redact");
  });

  it("adds --redact when redact is omitted (undefined !== false → default on)", async () => {
    spawnMock.mockReturnValue(makeFakeChild({ code: 0 }));
    readFileMock.mockRejectedValueOnce(new Error("ENOENT"));

    await runSecretsScan({ repoPath: "/repo" });
    expect(spawnMock.mock.calls[0][1]).toContain("--redact");
  });

  it("does not add --redact when redact is false", async () => {
    spawnMock.mockReturnValue(makeFakeChild({ code: 0 }));
    readFileMock.mockRejectedValueOnce(new Error("ENOENT"));

    await runSecretsScan({ repoPath: "/repo", redact: false });
    expect(spawnMock.mock.calls[0][1]).not.toContain("--redact");
  });

  it("passes baselinePath to loadBaselineFingerprints", async () => {
    spawnMock.mockReturnValue(makeFakeChild({ code: 0 }));
    readFileMock.mockRejectedValueOnce(new Error("ENOENT"));

    await runSecretsScan({
      repoPath: "/repo",
      baselinePath: "/my/baseline.json",
    });
    expect(baselineMock).toHaveBeenCalledWith("/my/baseline.json");
  });

  // -------------------------------------------------------------------------
  // Report parsing
  // -------------------------------------------------------------------------
  it("parses report file when readFile succeeds", async () => {
    const report = [
      {
        RuleID: "aws-access-key",
        File: "config.env",
        StartLine: 10,
        EndLine: 10,
        Fingerprint: "fp-aws-001",
        Secret: "AKIAIOSFODNN7EXAMPLE",
      },
    ];
    spawnMock.mockReturnValue(makeFakeChild({ code: 1 }));
    readFileMock.mockResolvedValueOnce(JSON.stringify(report));

    const result = await runSecretsScan({ repoPath: "/repo" });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].ruleId).toBe("aws-access-key");
    expect(result.raw).toHaveLength(1);
  });

  it("sets findings=[] when readFile throws", async () => {
    spawnMock.mockReturnValue(makeFakeChild({ code: 0 }));
    readFileMock.mockRejectedValueOnce(new Error("file gone"));

    const result = await runSecretsScan({ repoPath: "/repo" });
    expect(result.findings).toHaveLength(0);
    expect(result.raw).toEqual([]);
  });

  it("always calls fs.rm in finally even when readFile throws", async () => {
    spawnMock.mockReturnValue(makeFakeChild({ code: 0 }));
    readFileMock.mockRejectedValueOnce(new Error("gone"));

    await runSecretsScan({ repoPath: "/repo" });
    expect(rmMock).toHaveBeenCalledWith(
      expect.stringContaining("gitleaks-report"),
      { force: true },
    );
  });

  it("result includes command array with --no-git and all provided args", async () => {
    spawnMock.mockReturnValue(makeFakeChild({ code: 0 }));
    readFileMock.mockRejectedValueOnce(new Error("ENOENT"));

    const result = await runSecretsScan({
      repoPath: "/repo",
      configPath: "/cfg.toml",
      redact: true,
    });
    expect(result.command[0]).toBe("gitleaks");
    expect(result.command).toContain("--config");
    expect(result.command).toContain("--redact");
    expect(result.command).toContain("--no-git");
  });

  // -------------------------------------------------------------------------
  // normalizeFinding — field fallback branches
  // -------------------------------------------------------------------------
  it("normalizes a full gitleaks row with all Pascal-case fields", async () => {
    const row = {
      RuleID: "github-token",
      File: "src/app.ts",
      Description: "GitHub PAT",
      StartLine: 5,
      EndLine: 5,
      StartColumn: 10,
      EndColumn: 50,
      Fingerprint: "fp-gh-001",
      Secret: "ghp_abcdefghijklmno",
      Commit: "abc123",
      Author: "Dev",
      Email: "dev@example.com",
      Date: "2024-01-01",
      Match: "ghp_abc...",
      Tags: ["git"],
    };
    spawnMock.mockReturnValue(makeFakeChild({ code: 1 }));
    readFileMock.mockResolvedValueOnce(JSON.stringify([row]));

    const f = (await runSecretsScan({ repoPath: "/repo" })).findings[0];
    expect(f.ruleId).toBe("github-token");
    expect(f.file).toBe("src/app.ts");
    expect(f.description).toBe("GitHub PAT");
    expect(f.startLine).toBe(5);
    expect(f.startColumn).toBe(10);
    expect(f.endColumn).toBe(50);
    expect(f.commit).toBe("abc123");
    expect(f.author).toBe("Dev");
    expect(f.email).toBe("dev@example.com");
    expect(f.date).toBe("2024-01-01");
    expect(f.match).toBe("ghp_abc...");
    expect(f.tags).toEqual(["git"]);
    expect(f.fingerprint).toBe("fp-gh-001");
    expect(typeof f.id).toBe("string");
    expect(f.secretPreview).toMatch(/\.\.\./);
  });

  it("uses camelCase fallback fields when Pascal-case absent", async () => {
    const row = {
      ruleId: "generic-key",
      file: "lib/cfg.js",
      description: "API key",
      startLine: 3,
      endLine: 3,
      startColumn: 0,
      endColumn: 0,
      fingerprint: "fp-lower",
      secret: "tiny",
      commit: "def456",
      author: "Bot",
      email: "bot@x.com",
      date: "2024-02-01",
      match: "tiny",
      tags: [],
    };
    spawnMock.mockReturnValue(makeFakeChild({ code: 1 }));
    readFileMock.mockResolvedValueOnce(JSON.stringify([row]));

    const f = (await runSecretsScan({ repoPath: "/repo" })).findings[0];
    expect(f.ruleId).toBe("generic-key");
    expect(f.file).toBe("lib/cfg.js");
    expect(f.fingerprint).toBe("fp-lower");
  });

  it("uses ruleID (mixed case) fallback", async () => {
    spawnMock.mockReturnValue(makeFakeChild({ code: 1 }));
    readFileMock.mockResolvedValueOnce(
      JSON.stringify([{ ruleID: "stripe-key", File: "pay.js" }]),
    );
    expect(
      (await runSecretsScan({ repoPath: "/repo" })).findings[0].ruleId,
    ).toBe("stripe-key");
  });

  it("defaults ruleId to 'unknown' when all ruleId fields absent", async () => {
    spawnMock.mockReturnValue(makeFakeChild({ code: 1 }));
    readFileMock.mockResolvedValueOnce(JSON.stringify([{}]));
    expect(
      (await runSecretsScan({ repoPath: "/repo" })).findings[0].ruleId,
    ).toBe("unknown");
  });

  it("computes fingerprint via sha256 when Fingerprint field absent", async () => {
    spawnMock.mockReturnValue(makeFakeChild({ code: 1 }));
    readFileMock.mockResolvedValueOnce(
      JSON.stringify([
        { RuleID: "my-rule", File: "x.js", StartLine: 1, EndLine: 1 },
      ]),
    );
    expect(
      (await runSecretsScan({ repoPath: "/repo" })).findings[0].fingerprint,
    ).toMatch(/^[a-f0-9]{64}$/);
  });

  it("uses description fallback to ruleId when Description absent", async () => {
    spawnMock.mockReturnValue(makeFakeChild({ code: 1 }));
    readFileMock.mockResolvedValueOnce(
      JSON.stringify([{ RuleID: "my-rule", Fingerprint: "fp-x" }]),
    );
    expect(
      (await runSecretsScan({ repoPath: "/repo" })).findings[0].description,
    ).toBe("my-rule");
  });

  it("uses endLine fallback to startLine when EndLine absent", async () => {
    spawnMock.mockReturnValue(makeFakeChild({ code: 1 }));
    readFileMock.mockResolvedValueOnce(
      JSON.stringify([{ RuleID: "r", Fingerprint: "fp", StartLine: 7 }]),
    );
    expect(
      (await runSecretsScan({ repoPath: "/repo" })).findings[0].endLine,
    ).toBe(7);
  });

  it("defaults startColumn and endColumn to 0 when absent", async () => {
    spawnMock.mockReturnValue(makeFakeChild({ code: 1 }));
    readFileMock.mockResolvedValueOnce(
      JSON.stringify([{ RuleID: "r", Fingerprint: "fp", StartLine: 3 }]),
    );
    const f = (await runSecretsScan({ repoPath: "/repo" })).findings[0];
    expect(f.startColumn).toBe(0);
    expect(f.endColumn).toBe(0);
  });

  it("null-defaults commit, author, email, date, match when absent", async () => {
    spawnMock.mockReturnValue(makeFakeChild({ code: 1 }));
    readFileMock.mockResolvedValueOnce(
      JSON.stringify([{ RuleID: "r", Fingerprint: "fp" }]),
    );
    const f = (await runSecretsScan({ repoPath: "/repo" })).findings[0];
    expect(f.commit).toBeNull();
    expect(f.author).toBeNull();
    expect(f.email).toBeNull();
    expect(f.date).toBeNull();
    expect(f.match).toBeNull();
  });

  it("tags defaults to [] when Tags is not an array", async () => {
    spawnMock.mockReturnValue(makeFakeChild({ code: 1 }));
    readFileMock.mockResolvedValueOnce(
      JSON.stringify([{ RuleID: "r", Fingerprint: "fp", Tags: "not-array" }]),
    );
    expect(
      (await runSecretsScan({ repoPath: "/repo" })).findings[0].tags,
    ).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // previewSecret branches
  // -------------------------------------------------------------------------
  it("previewSecret returns null for non-string secret", async () => {
    spawnMock.mockReturnValue(makeFakeChild({ code: 1 }));
    readFileMock.mockResolvedValueOnce(
      JSON.stringify([{ RuleID: "r", Fingerprint: "fp", Secret: null }]),
    );
    expect(
      (await runSecretsScan({ repoPath: "/repo" })).findings[0].secretPreview,
    ).toBeNull();
  });

  it("previewSecret returns null for empty string", async () => {
    spawnMock.mockReturnValue(makeFakeChild({ code: 1 }));
    readFileMock.mockResolvedValueOnce(
      JSON.stringify([{ RuleID: "r", Fingerprint: "fp", Secret: "" }]),
    );
    expect(
      (await runSecretsScan({ repoPath: "/repo" })).findings[0].secretPreview,
    ).toBeNull();
  });

  it("previewSecret masks short secrets (≤8 chars) with stars", async () => {
    spawnMock.mockReturnValue(makeFakeChild({ code: 1 }));
    readFileMock.mockResolvedValueOnce(
      JSON.stringify([{ RuleID: "r", Fingerprint: "fp", Secret: "short" }]),
    );
    expect(
      (await runSecretsScan({ repoPath: "/repo" })).findings[0].secretPreview,
    ).toBe("*****");
  });

  it("previewSecret shows first4...last4 for secrets longer than 8 chars", async () => {
    spawnMock.mockReturnValue(makeFakeChild({ code: 1 }));
    readFileMock.mockResolvedValueOnce(
      JSON.stringify([
        { RuleID: "r", Fingerprint: "fp", Secret: "AKIAIOSFODNN7EXAMPLE" },
      ]),
    );
    expect(
      (await runSecretsScan({ repoPath: "/repo" })).findings[0].secretPreview,
    ).toBe("AKIA...MPLE");
  });

  // -------------------------------------------------------------------------
  // mapSeverity branches
  // -------------------------------------------------------------------------
  it.each([
    ["private-key-rsa", "critical"],
    ["aws-access-key", "critical"],
    ["anthropic-api-key", "critical"],
    ["openai-api-key", "critical"],
    ["github-token", "high"],
    ["client-secret", "high"],
    ["stripe-key", "medium"],
    ["generic-leak", "low"],
  ])("mapSeverity: ruleId=%s → %s", async (ruleId, expected) => {
    spawnMock.mockReturnValue(makeFakeChild({ code: 1 }));
    readFileMock.mockResolvedValueOnce(
      JSON.stringify([{ RuleID: ruleId, Fingerprint: "fp" }]),
    );
    expect(
      (await runSecretsScan({ repoPath: "/repo" })).findings[0].severity,
    ).toBe(expected);
  });

  it("mapSeverity: 'aws' in description (not ruleId) → critical", async () => {
    spawnMock.mockReturnValue(makeFakeChild({ code: 1 }));
    readFileMock.mockResolvedValueOnce(
      JSON.stringify([
        {
          RuleID: "generic-leak",
          Description: "AWS Secret Key detected",
          Fingerprint: "fp",
        },
      ]),
    );
    expect(
      (await runSecretsScan({ repoPath: "/repo" })).findings[0].severity,
    ).toBe("critical");
  });

  it("mapSeverity: 'token' in description (not ruleId) → high", async () => {
    spawnMock.mockReturnValue(makeFakeChild({ code: 1 }));
    readFileMock.mockResolvedValueOnce(
      JSON.stringify([
        {
          RuleID: "generic-leak",
          Description: "OAuth token exposed",
          Fingerprint: "fp",
        },
      ]),
    );
    expect(
      (await runSecretsScan({ repoPath: "/repo" })).findings[0].severity,
    ).toBe("high");
  });

  // -------------------------------------------------------------------------
  // mapCategory branches
  // -------------------------------------------------------------------------
  it.each([
    ["rsa-private-key", "private_key"],
    ["gh-token", "token"],
    ["client-secret", "credential"],
    ["db-password", "credential"],
    ["stripe-key", "generic"],
    ["generic-leak", "unknown"],
  ])("mapCategory: ruleId=%s → %s", async (ruleId, expected) => {
    spawnMock.mockReturnValue(makeFakeChild({ code: 1 }));
    readFileMock.mockResolvedValueOnce(
      JSON.stringify([{ RuleID: ruleId, Fingerprint: "fp" }]),
    );
    expect(
      (await runSecretsScan({ repoPath: "/repo" })).findings[0].category,
    ).toBe(expected);
  });

  // -------------------------------------------------------------------------
  // buildSummary branches
  // -------------------------------------------------------------------------
  it("buildSummary counts bySeverity, byRule, baselineMatched, unsuppressed", async () => {
    const report = [
      { RuleID: "aws-access-key", Fingerprint: "fp-1" },
      { RuleID: "github-token", Fingerprint: "fp-2" },
      { RuleID: "generic-leak", Fingerprint: "fp-3" },
    ];
    spawnMock.mockReturnValue(makeFakeChild({ code: 1 }));
    readFileMock.mockResolvedValueOnce(JSON.stringify(report));
    baselineMock.mockResolvedValueOnce(new Set(["fp-3"]));

    const { summary } = await runSecretsScan({ repoPath: "/repo" });
    expect(summary.findings).toBe(3);
    expect(summary.baselineMatched).toBe(1);
    expect(summary.unsuppressed).toBe(2);
    expect(summary.bySeverity.critical).toBe(1);
    expect(summary.bySeverity.high).toBe(1);
    expect(summary.bySeverity.low).toBe(1);
    expect(summary.byRule["aws-access-key"]).toBe(1);
  });

  it("unsuppressed excludes both suppressed and baselineMatched", async () => {
    const report = [
      { RuleID: "aws-access-key", Fingerprint: "fp-active" },
      { RuleID: "github-token", Fingerprint: "fp-baseline" },
      { RuleID: "client-secret", Fingerprint: "fp-suppressed" },
    ];
    const suppressionsData = [
      { fingerprint: "fp-suppressed", reason: "test fixture" },
    ];
    spawnMock.mockReturnValue(makeFakeChild({ code: 1 }));
    readFileMock
      .mockResolvedValueOnce(JSON.stringify(report))
      .mockResolvedValueOnce(JSON.stringify(suppressionsData));
    baselineMock.mockResolvedValueOnce(new Set(["fp-baseline"]));

    const result = await runSecretsScan({
      repoPath: "/repo",
      suppressionsPath: "/suppressions.json",
    });
    expect(result.summary.findings).toBe(3);
    expect(result.summary.baselineMatched).toBe(1);
    expect(result.summary.suppressed).toBe(1);
    expect(result.summary.unsuppressed).toBe(1);
  });

  it("buildSummary counts suppressed findings from suppressions file", async () => {
    const report = [{ RuleID: "github-token", Fingerprint: "fp-sup-1" }];
    const suppressionsData = [
      { fingerprint: "fp-sup-1", reason: "accepted risk" },
    ];
    spawnMock.mockReturnValue(makeFakeChild({ code: 1 }));
    readFileMock
      .mockResolvedValueOnce(JSON.stringify(report))
      .mockResolvedValueOnce(JSON.stringify(suppressionsData));

    const result = await runSecretsScan({
      repoPath: "/repo",
      suppressionsPath: "/suppressions.json",
    });
    expect(result.summary.suppressed).toBe(1);
    expect(result.findings[0].suppressed).toBe(true);
    expect(result.findings[0].suppressionReason).toBe("accepted risk");
  });

  it("buildSummary.scannedPath equals the repoPath option", async () => {
    spawnMock.mockReturnValue(makeFakeChild({ code: 0 }));
    readFileMock.mockRejectedValueOnce(new Error("ENOENT"));
    expect(
      (await runSecretsScan({ repoPath: "/my/project" })).summary.scannedPath,
    ).toBe("/my/project");
  });

  it("buildSummary sets completedAt to a current timestamp", async () => {
    const before = Date.now();
    spawnMock.mockReturnValue(makeFakeChild({ code: 0 }));
    readFileMock.mockRejectedValueOnce(new Error("ENOENT"));
    const result = await runSecretsScan({ repoPath: "/repo" });
    expect(result.summary.completedAt).toBeGreaterThanOrEqual(before);
    expect(result.summary.completedAt).toBeLessThanOrEqual(Date.now());
  });
});
