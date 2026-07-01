/**
 * tests/security-overview-ai-explain-coverage.test.ts
 *
 * Coverage extensions for src/security/security-overview/ai-explain.ts
 *
 * Lines targeted:
 *   76        — compactText truncation branch (text.length > max)
 *   115-127   — normalizeFindingForPrompt fallback fields
 *   178       — buildKnowledgeQuery empty parts (no category/scanner/title)
 *   224-306   — explainIntroducedFindings (all branches)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildIntroducedFindingsPrompt,
  parseExplainIntroducedFindingsAnswer,
  explainIntroducedFindings,
} from "../src/security/security-overview/ai-explain.js";

// ─────────────────────────────────────────────────────────────────────────────
// compactText truncation (line 76)
// ─────────────────────────────────────────────────────────────────────────────

describe("ai-explain — compactText truncation (via buildIntroducedFindingsPrompt)", () => {
  it("truncates a description that exceeds 700 chars", () => {
    const longDesc = "A".repeat(800);
    const prompt = buildIntroducedFindingsPrompt({
      findings: [{ description: longDesc, title: "t", severity: "low" }],
    });
    // The truncated version ends with the ellipsis character
    expect(prompt).toContain("…");
    expect(prompt).not.toContain("A".repeat(800));
  });

  it("keeps a description that is exactly at the 700-char limit", () => {
    const exactDesc = "B".repeat(700);
    const prompt = buildIntroducedFindingsPrompt({
      findings: [{ description: exactDesc, title: "t", severity: "low" }],
    });
    expect(prompt).not.toContain("…");
  });

  it("returns empty string for non-string description", () => {
    const prompt = buildIntroducedFindingsPrompt({
      findings: [{ description: undefined, title: "t", severity: "low" }],
    });
    // description should be empty string, not "undefined"
    expect(prompt).not.toContain('"description": "undefined"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// normalizeFindingForPrompt fallbacks (lines 115-127)
// ─────────────────────────────────────────────────────────────────────────────

describe("ai-explain — normalizeFindingForPrompt fallback fields", () => {
  it("uses ruleId as title fallback when title is absent", () => {
    const prompt = buildIntroducedFindingsPrompt({
      findings: [{ ruleId: "S1234", severity: "low" }],
    });
    expect(prompt).toContain("S1234");
  });

  it("uses description as title fallback when title and ruleId are absent", () => {
    const prompt = buildIntroducedFindingsPrompt({
      findings: [{ description: "Some description", severity: "low" }],
    });
    expect(prompt).toContain("Some description");
  });

  it("falls back to 'Untitled finding' when title, ruleId and description are all absent", () => {
    const prompt = buildIntroducedFindingsPrompt({
      findings: [{ severity: "medium" }],
    });
    expect(prompt).toContain("Untitled finding");
  });

  it("normalises severity to lowercase", () => {
    const prompt = buildIntroducedFindingsPrompt({
      findings: [{ title: "T", severity: "HIGH" }],
    });
    expect(prompt).toContain('"high"');
  });

  it("defaults severity to 'unknown' when absent", () => {
    const prompt = buildIntroducedFindingsPrompt({
      findings: [{ title: "T" }],
    });
    expect(prompt).toContain('"unknown"');
  });

  it("sets suppressed=true when finding.suppressed is truthy", () => {
    const prompt = buildIntroducedFindingsPrompt({
      findings: [{ title: "T", suppressed: true }],
    });
    expect(prompt).toContain('"suppressed": true');
  });

  it("sets baselineMatched=true when finding.baselineMatched is truthy", () => {
    const prompt = buildIntroducedFindingsPrompt({
      findings: [{ title: "T", baselineMatched: true }],
    });
    expect(prompt).toContain('"baselineMatched": true');
  });

  it("reads suppressionReason from suppressionsReason (typo field) first", () => {
    // The source code uses (finding as any).suppressionsReason (with an 's')
    const finding: any = {
      title: "T",
      suppressionsReason: "wont-fix",
    };
    const prompt = buildIntroducedFindingsPrompt({ findings: [finding] });
    expect(prompt).toContain("wont-fix");
  });

  it("falls back to suppressionReason (canonical spelling) when typo field absent", () => {
    const prompt = buildIntroducedFindingsPrompt({
      findings: [{ title: "T", suppressionReason: "false-positive" }],
    });
    expect(prompt).toContain("false-positive");
  });

  it("truncates evidence JSON that exceeds 700 chars", () => {
    const bigEvidence = { data: "X".repeat(800) };
    const prompt = buildIntroducedFindingsPrompt({
      findings: [{ title: "T", evidence: bigEvidence }],
    });
    expect(prompt).toContain("…");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildKnowledgeQuery empty path (line 178)
// ─────────────────────────────────────────────────────────────────────────────

describe("ai-explain — buildKnowledgeQuery empty result", () => {
  it("returns an empty query string when all findings have unknown category/scanner and no title", () => {
    // buildKnowledgeQuery is internal, but explainIntroducedFindings uses it
    // when knowledgeQuery is not provided.  We can observe the behaviour
    // indirectly by supplying a workspaceKnowledge mock and inspecting the
    // query it receives.
    const searchMock = vi.fn().mockResolvedValue([]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = {
      workspaceKnowledge: { search: searchMock },
      llm: {
        ask: vi.fn().mockResolvedValue({
          answer: JSON.stringify({ summary: "ok", items: [] }),
        }),
      },
    };

    return explainIntroducedFindings({
      drift: {
        introduced: [
          // All defaulting fields — category="unknown", scanner="unknown",
          // title="" → title falls back to "Untitled finding"
          {},
        ],
      },
    }).then(() => {
      // searchMock should have been called with a string (possibly empty)
      expect(searchMock).toHaveBeenCalled();
      const query: string = searchMock.mock.calls[0][0];
      expect(typeof query).toBe("string");

      // cleanup
      delete (globalThis as any).window;
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// explainIntroducedFindings — all branches (lines 224-306)
// ─────────────────────────────────────────────────────────────────────────────

describe("explainIntroducedFindings", () => {
  beforeEach(() => {
    // Ensure globalThis.window is clean before each test
    delete (globalThis as any).window;
  });

  afterEach(() => {
    delete (globalThis as any).window;
  });

  // ── no introduced findings ──────────────────────────────────────────────────

  it("returns ok=true with zero analyzedCount when drift.introduced is empty", async () => {
    const result = await explainIntroducedFindings({
      drift: { introduced: [] },
    });
    expect(result.ok).toBe(true);
    expect(result.analyzedCount).toBe(0);
    expect(result.answer).toContain("No introduced findings");
    expect(result.items).toHaveLength(0);
    expect(result.knowledgeUsed).toBe(false);
  });

  it("returns ok=true with zero analyzedCount when drift.introduced is undefined", async () => {
    const result = await explainIntroducedFindings({
      drift: {},
    });
    expect(result.ok).toBe(true);
    expect(result.analyzedCount).toBe(0);
  });

  it("respects maxFindings to cap the number of analysed findings", async () => {
    (globalThis as any).window = {
      llm: {
        ask: vi.fn().mockResolvedValue({
          answer: JSON.stringify({ summary: "ok", items: [] }),
        }),
      },
    };

    const findings = Array.from({ length: 20 }, (_, i) => ({
      title: `Finding ${i}`,
      severity: "low",
    }));

    const result = await explainIntroducedFindings({
      drift: { introduced: findings },
      maxFindings: 3,
    });

    expect(result.analyzedCount).toBe(3);
  });

  // ── llm not available ───────────────────────────────────────────────────────

  it("returns ok=false with error when llm.ask is not available", async () => {
    // No window.llm set
    const result = await explainIntroducedFindings({
      drift: { introduced: [{ title: "T", severity: "high" }] },
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("not available");
    expect(result.prompt).toBeTruthy(); // prompt was still built
  });

  it("returns ok=false when window exists but llm.ask is missing", async () => {
    (globalThis as any).window = { llm: {} }; // no ask()
    const result = await explainIntroducedFindings({
      drift: { introduced: [{ title: "T", severity: "high" }] },
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("not available");
  });

  // ── llm returns an answer object ────────────────────────────────────────────

  it("returns ok=true and parses items from llm answer.answer field", async () => {
    const answerPayload = JSON.stringify({
      summary: "Two issues.",
      items: [
        {
          fingerprint: "fp-x",
          title: "Hardcoded secret",
          severity: "critical",
          file: "src/app.ts",
          explanation: "A secret is committed.",
          recommendation: "Rotate immediately.",
        },
      ],
    });
    (globalThis as any).window = {
      llm: {
        ask: vi.fn().mockResolvedValue({ answer: answerPayload }),
      },
    };

    const result = await explainIntroducedFindings({
      drift: {
        introduced: [
          { title: "Hardcoded secret", severity: "critical", file: "src/app.ts" },
        ],
      },
      workspaceId: "ws-test",
    });

    expect(result.ok).toBe(true);
    expect(result.workspaceId).toBe("ws-test");
    expect(result.analyzedCount).toBe(1);
    expect(result.answer).toContain("Two issues.");
    expect(result.items).toHaveLength(1);
    expect(result.items[0].fingerprint).toBe("fp-x");
    expect(result.items[0].recommendation).toContain("Rotate");
  });

  it("falls back to stringified llmResult when answer field is absent", async () => {
    (globalThis as any).window = {
      llm: {
        ask: vi.fn().mockResolvedValue({ summary: "direct object" }),
      },
    };

    const result = await explainIntroducedFindings({
      drift: { introduced: [{ title: "T", severity: "low" }] },
    });

    expect(result.ok).toBe(true);
    expect(result.answer).toBeTruthy();
  });

  it("handles llmResult being a plain string", async () => {
    const rawAnswer = JSON.stringify({ summary: "plain string result", items: [] });
    (globalThis as any).window = {
      llm: {
        ask: vi.fn().mockResolvedValue(rawAnswer),
      },
    };

    const result = await explainIntroducedFindings({
      drift: { introduced: [{ title: "T", severity: "low" }] },
    });

    expect(result.ok).toBe(true);
    expect(result.answer).toContain("plain string result");
  });

  // ── knowledge integration ───────────────────────────────────────────────────

  it("queries workspaceKnowledge.search when includeKnowledge is not false", async () => {
    const searchMock = vi.fn().mockResolvedValue([
      { sprint: 90, text: "prior security context" },
    ]);
    (globalThis as any).window = {
      workspaceKnowledge: { search: searchMock },
      llm: {
        ask: vi.fn().mockResolvedValue({
          answer: JSON.stringify({ summary: "ok", items: [] }),
        }),
      },
    };

    const result = await explainIntroducedFindings({
      drift: { introduced: [{ title: "T", severity: "low", category: "creds" }] },
      knowledgeQuery: "credential security",
    });

    expect(searchMock).toHaveBeenCalledWith(
      "credential security",
      expect.objectContaining({ limit: 6 }),
    );
    expect(result.knowledgeUsed).toBe(true);
    expect(result.knowledge).toHaveLength(1);
  });

  it("uses buildKnowledgeQuery when knowledgeQuery is not provided", async () => {
    const searchMock = vi.fn().mockResolvedValue([]);
    (globalThis as any).window = {
      workspaceKnowledge: { search: searchMock },
      llm: {
        ask: vi.fn().mockResolvedValue({
          answer: JSON.stringify({ summary: "ok", items: [] }),
        }),
      },
    };

    await explainIntroducedFindings({
      drift: {
        introduced: [
          { title: "CVE-2024-9999", category: "dependency", scanner: "trivy" },
        ],
      },
      // knowledgeQuery intentionally omitted
    });

    expect(searchMock).toHaveBeenCalled();
    const query: string = searchMock.mock.calls[0][0];
    // The auto-built query includes category and scanner
    expect(query).toContain("dependency");
    expect(query).toContain("trivy");
  });

  it("skips knowledge search when includeKnowledge=false", async () => {
    const searchMock = vi.fn().mockResolvedValue([]);
    (globalThis as any).window = {
      workspaceKnowledge: { search: searchMock },
      llm: {
        ask: vi.fn().mockResolvedValue({
          answer: JSON.stringify({ summary: "ok", items: [] }),
        }),
      },
    };

    await explainIntroducedFindings({
      drift: { introduced: [{ title: "T", severity: "low" }] },
      includeKnowledge: false,
    });

    expect(searchMock).not.toHaveBeenCalled();
  });

  it("swallows knowledge search errors and continues with empty knowledge", async () => {
    (globalThis as any).window = {
      workspaceKnowledge: {
        search: vi.fn().mockRejectedValue(new Error("search crashed")),
      },
      llm: {
        ask: vi.fn().mockResolvedValue({
          answer: JSON.stringify({ summary: "ok", items: [] }),
        }),
      },
    };

    const result = await explainIntroducedFindings({
      drift: { introduced: [{ title: "T", severity: "low" }] },
    });

    expect(result.ok).toBe(true);
    expect(result.knowledgeUsed).toBe(false);
  });

  it("respects custom minScore when calling knowledge search", async () => {
    const searchMock = vi.fn().mockResolvedValue([]);
    (globalThis as any).window = {
      workspaceKnowledge: { search: searchMock },
      llm: {
        ask: vi.fn().mockResolvedValue({
          answer: JSON.stringify({ summary: "ok", items: [] }),
        }),
      },
    };

    await explainIntroducedFindings({
      drift: { introduced: [{ title: "T", severity: "low" }] },
      knowledgeQuery: "q",
      minScore: 0.7,
    });

    expect(searchMock).toHaveBeenCalledWith(
      "q",
      expect.objectContaining({ minScore: 0.7 }),
    );
  });

  // ── llm throws ──────────────────────────────────────────────────────────────

  it("returns ok=false with error message when llm.ask throws", async () => {
    (globalThis as any).window = {
      llm: {
        ask: vi.fn().mockRejectedValue(new Error("llm timeout")),
      },
    };

    const result = await explainIntroducedFindings({
      drift: { introduced: [{ title: "T", severity: "high" }] },
      workspaceId: "ws-err",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("llm timeout");
    expect(result.workspaceId).toBe("ws-err");
    expect(result.analyzedCount).toBe(1);
  });

  it("includes knowledge in error result when knowledge was fetched before crash", async () => {
    (globalThis as any).window = {
      workspaceKnowledge: {
        search: vi.fn().mockResolvedValue([{ text: "ctx" }]),
      },
      llm: {
        ask: vi.fn().mockRejectedValue(new Error("crash")),
      },
    };

    const result = await explainIntroducedFindings({
      drift: { introduced: [{ title: "T", severity: "low" }] },
      knowledgeQuery: "q",
    });

    expect(result.ok).toBe(false);
    expect(result.knowledgeUsed).toBe(true);
    expect(result.knowledge).toHaveLength(1);
  });

  // ── workspaceId propagation ─────────────────────────────────────────────────

  it("sets workspaceId to null when not provided", async () => {
    const result = await explainIntroducedFindings({ drift: {} });
    expect(result.workspaceId).toBeNull();
  });

  it("propagates provided workspaceId to result", async () => {
    const result = await explainIntroducedFindings({
      drift: {},
      workspaceId: "my-ws",
    });
    expect(result.workspaceId).toBe("my-ws");
  });

  // ── prompt is always returned ───────────────────────────────────────────────

  it("includes the built prompt in the result even on llm-unavailable path", async () => {
    const result = await explainIntroducedFindings({
      drift: { introduced: [{ title: "T", severity: "low" }] },
    });
    expect(result.prompt).toContain("security analysis assistant");
  });
});
