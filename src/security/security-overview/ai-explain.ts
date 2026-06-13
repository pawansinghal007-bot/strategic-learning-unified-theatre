import fs from "node:fs";

export interface SecurityOverviewFindingLike {
  id?: string;
  title?: string;
  description?: string;
  ruleId?: string;
  severity?: string;
  category?: string;
  file?: string | null;
  package?: string | null;
  version?: string | null;
  scanner?: string;
  fingerprint?: string;
  triageStatus?: string;
  baselineMatched?: boolean;
  suppressed?: boolean;
  suppressionReason?: string | null;
  evidence?: unknown;
  raw?: unknown;
}

export interface SecurityOverviewDriftLike {
  introduced?: SecurityOverviewFindingLike[];
  persistent?: SecurityOverviewFindingLike[];
  resolved?: SecurityOverviewFindingLike[];
}

export interface ExplainIntroducedFindingsOptions {
  workspaceId?: string;
  maxFindings?: number;
  model?: string;
  includeKnowledge?: boolean;
  knowledgeQuery?: string;
  minScore?: number;
}

export interface FindingExplanationItem {
  fingerprint: string | null;
  title: string;
  severity: string;
  file: string | null;
  explanation: string;
  recommendation: string;
}

export interface ExplainIntroducedFindingsResult {
  ok: boolean;
  workspaceId: string | null;
  analyzedCount: number;
  knowledgeUsed: boolean;
  prompt: string;
  answer: string;
  items: FindingExplanationItem[];
  knowledge?: Array<{
    chunkid?: string;
    docid?: string;
    sourcetype?: string;
    sprint?: number;
    featurearea?: string;
    path?: string;
    section?: string;
    importance?: number;
    score?: number;
    text?: string;
  }>;
  error?: string;
}

function toArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function stringifySafe(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function compactText(value: unknown, max = 500): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function normalizeFindingForPrompt(finding: SecurityOverviewFindingLike) {
  return {
    fingerprint: finding?.fingerprint ?? null,
    title:
      finding?.title ||
      finding?.ruleId ||
      finding?.description ||
      "Untitled finding",
    severity: (finding?.severity || "unknown").toLowerCase(),
    category: finding?.category || "unknown",
    file: finding?.file ?? null,
    package: finding?.package ?? null,
    version: finding?.version ?? null,
    scanner: finding?.scanner || "unknown",
    triageStatus: finding?.triageStatus || "open",
    suppressed: Boolean(finding?.suppressed),
    baselineMatched: Boolean(finding?.baselineMatched),
    suppressionReason:
      (finding as any)?.suppressionsReason ??
      finding?.suppressionReason ??
      null,
    description: compactText(finding?.description, 700),
    evidence: compactText(stringifySafe(finding?.evidence), 700),
  };
}

function buildKnowledgeQuery(
  findings: ReturnType<typeof normalizeFindingForPrompt>[],
): string {
  const parts = new Set<string>();
  for (const item of findings.slice(0, 5)) {
    if (item.category && item.category !== "unknown") {
      parts.add(item.category);
    }
    if (item.scanner && item.scanner !== "unknown") {
      parts.add(item.scanner);
    }
    if (item.title) {
      parts.add(item.title.split(/\s+/).slice(0, 6).join(" "));
    }
  }
  return Array.from(parts).join(" ").trim();
}

export function buildIntroducedFindingsPrompt(params: {
  workspaceId?: string;
  findings: SecurityOverviewFindingLike[];
  knowledge?: Array<Record<string, unknown>>;
}): string {
  const normalized = params.findings.map(normalizeFindingForPrompt);
  const knowledge = toArray(params.knowledge).slice(0, 6);

  return [
    "You are a security analysis assistant for a local desktop governance tool.",
    "Your job is to explain newly introduced security findings in plain language.",
    "Focus on practical impact, likely cause, and next action.",
    "Do not invent facts that are not present in the findings.",
    "",
    `Workspace: ${params.workspaceId || "unknown"}`,
    `Introduced findings count: ${normalized.length}`,
    "",
    "Introduced findings:",
    stringifySafe(normalized),
    "",
    "Optional knowledge context:",
    stringifySafe(knowledge),
    "",
    "Return strict JSON with this shape:",
    stringifySafe({
      summary: "short overall summary",
      items: [
        {
          fingerprint: "string|null",
          title: "string",
          severity: "string",
          file: "string|null",
          explanation: "short plain-language explanation",
          recommendation: "short next step",
        },
      ],
    }),
  ].join("\n");
}

function extractJsonObject(text: string): any | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const slice = text.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    return null;
  }
}

export function parseExplainIntroducedFindingsAnswer(answer: string): {
  summary: string;
  items: FindingExplanationItem[];
} {
  const parsed = extractJsonObject(answer);
  if (!parsed || typeof parsed !== "object") {
    return { summary: answer.trim(), items: [] };
  }

  const items = toArray(parsed.items).map((item) => ({
    fingerprint: item?.fingerprint ?? null,
    title:
      typeof item?.title === "string" ? item.title : "Untitled finding",
    severity:
      typeof item?.severity === "string" ? item.severity : "unknown",
    file: typeof item?.file === "string" ? item.file : null,
    explanation:
      typeof item?.explanation === "string"
        ? item.explanation
        : "No explanation returned.",
    recommendation:
      typeof item?.recommendation === "string"
        ? item.recommendation
        : "Review this finding manually.",
  }));

  return {
    summary:
      typeof parsed.summary === "string" && parsed.summary.trim()
        ? parsed.summary.trim()
        : answer.trim(),
    items,
  };
}

export async function explainIntroducedFindings(params: {
  drift: SecurityOverviewDriftLike;
  workspaceId?: string;
  maxFindings?: number;
  model?: string;
  includeKnowledge?: boolean;
  knowledgeQuery?: string;
  minScore?: number;
}): Promise<ExplainIntroducedFindingsResult> {
  const introduced = toArray(params?.drift?.introduced).slice(
    0,
    Math.max(1, params.maxFindings ?? 10),
  );

  if (!introduced.length) {
    return {
      ok: true,
      workspaceId: params.workspaceId || null,
      analyzedCount: 0,
      knowledgeUsed: false,
      prompt: "",
      answer: "No introduced findings to explain.",
      items: [],
    };
  }

  let knowledge: any[] = [];
  if (params.includeKnowledge !== false) {
    try {
      const knowledgeApi = (globalThis as any).window?.workspaceKnowledge;
      if (knowledgeApi?.search) {
        const normalized = introduced.map(normalizeFindingForPrompt);
        const queryText =
          params.knowledgeQuery?.trim() ||
          buildKnowledgeQuery(normalized);
        knowledge = await knowledgeApi.search(queryText, {
          limit: 6,
          minScore: params.minScore ?? 0.35,
        });
      }
    } catch {
      knowledge = [];
    }
  }

  const prompt = buildIntroducedFindingsPrompt({
    workspaceId: params.workspaceId,
    findings: introduced,
    knowledge,
  });

  try {
    const llmApi = (globalThis as any).window?.llm;
    if (!llmApi?.ask) {
      return {
        ok: false,
        workspaceId: params.workspaceId || null,
        analyzedCount: introduced.length,
        knowledgeUsed: knowledge.length > 0,
        prompt,
        answer: "",
        items: [],
        knowledge,
        error: "window.llm.ask is not available in this context",
      };
    }

    const llmResult = await llmApi.ask({
      prompt,
      model: params.model,
    });

    const answer =
      typeof llmResult?.answer === "string"
        ? llmResult.answer
        : typeof llmResult === "string"
          ? llmResult
          : stringifySafe(llmResult);

    const parsed = parseExplainIntroducedFindingsAnswer(answer);

    return {
      ok: true,
      workspaceId: params.workspaceId || null,
      analyzedCount: introduced.length,
      knowledgeUsed: knowledge.length > 0,
      prompt,
      answer: parsed.summary || answer,
      items: parsed.items,
      knowledge,
    };
  } catch (err: any) {
    return {
      ok: false,
      workspaceId: params.workspaceId || null,
      analyzedCount: introduced.length,
      knowledgeUsed: knowledge.length > 0,
      prompt,
      answer: "",
      items: [],
      knowledge,
      error: err?.message || String(err),
    };
  }
}
