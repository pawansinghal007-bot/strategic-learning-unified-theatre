import { describe, it, expect } from "vitest";
import {
  buildIntroducedFindingsPrompt,
  parseExplainIntroducedFindingsAnswer,
} from "../src/security/security-overview/ai-explain.js";

describe("Sprint 49 ai-explain — buildIntroducedFindingsPrompt", () => {
  it("includes workspace ID in prompt", () => {
    const prompt = buildIntroducedFindingsPrompt({
      workspaceId: "ws-test-1",
      findings: [
        {
          fingerprint: "fp-1",
          title: "Hardcoded AWS key",
          severity: "critical",
          file: "src/app.js",
          scanner: "gitleaks",
          category: "credential",
          description: "Potential hardcoded secret detected",
        },
      ],
      knowledge: [],
    });
    expect(prompt).toContain("Workspace: ws-test-1");
  });

  it("includes finding title and scanner in prompt", () => {
    const prompt = buildIntroducedFindingsPrompt({
      workspaceId: "ws-test-2",
      findings: [
        {
          title: "CVE-2024-1234 in openssl",
          scanner: "trivy",
          severity: "high",
          package: "openssl",
          version: "1.1.1",
        },
      ],
    });
    expect(prompt).toContain("trivy");
    expect(prompt).toContain("CVE-2024-1234");
  });

  it("includes introduced findings count", () => {
    const prompt = buildIntroducedFindingsPrompt({
      findings: [
        { title: "Finding A", severity: "medium", scanner: "gitleaks" },
        { title: "Finding B", severity: "low", scanner: "trivy" },
      ],
    });
    expect(prompt).toContain("Introduced findings count: 2");
  });

  it("instructs LLM to return strict JSON", () => {
    const prompt = buildIntroducedFindingsPrompt({ findings: [] });
    expect(prompt).toContain("strict JSON");
  });

  it("includes knowledge context when provided", () => {
    const prompt = buildIntroducedFindingsPrompt({
      findings: [{ title: "A", severity: "low" }],
      knowledge: [{ sprint: 48, featurearea: "security", text: "drift info" }],
    });
    expect(prompt).toContain("drift info");
  });

  it("falls back to unknown workspace when not provided", () => {
    const prompt = buildIntroducedFindingsPrompt({ findings: [] });
    expect(prompt).toContain("Workspace: unknown");
  });
});

describe("Sprint 49 ai-explain — parseExplainIntroducedFindingsAnswer", () => {
  it("parses valid JSON answer", () => {
    const answer = JSON.stringify({
      summary: "Two new findings need review.",
      items: [
        {
          fingerprint: "fp-1",
          title: "Hardcoded AWS key",
          severity: "critical",
          file: "src/app.js",
          explanation: "A secret appears to be committed in code.",
          recommendation: "Rotate the key and remove it from source.",
        },
      ],
    });
    const parsed = parseExplainIntroducedFindingsAnswer(answer);
    expect(parsed.summary).toContain("Two new findings");
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].fingerprint).toBe("fp-1");
    expect(parsed.items[0].recommendation).toContain("Rotate");
  });

  it("extracts JSON when wrapped in prose", () => {
    const answer =
      'Here is my analysis:\n\n{"summary":"One issue found.","items":[]}';
    const parsed = parseExplainIntroducedFindingsAnswer(answer);
    expect(parsed.summary).toBe("One issue found.");
    expect(parsed.items).toHaveLength(0);
  });

  it("falls back to raw text when no JSON found", () => {
    const parsed = parseExplainIntroducedFindingsAnswer(
      "Plain text answer without JSON",
    );
    expect(parsed.summary).toBe("Plain text answer without JSON");
    expect(parsed.items).toHaveLength(0);
  });

  it("defaults item fields when missing", () => {
    const answer = JSON.stringify({
      summary: "x",
      items: [{}],
    });
    const parsed = parseExplainIntroducedFindingsAnswer(answer);
    expect(parsed.items[0].title).toBe("Untitled finding");
    expect(parsed.items[0].severity).toBe("unknown");
    expect(parsed.items[0].explanation).toContain("No explanation");
    expect(parsed.items[0].recommendation).toContain("Review");
  });

  it("returns empty items array when items is not array", () => {
    const answer = JSON.stringify({
      summary: "summary only",
      items: null,
    });
    const parsed = parseExplainIntroducedFindingsAnswer(answer);
    expect(Array.isArray(parsed.items)).toBe(true);
    expect(parsed.items).toHaveLength(0);
  });
});
