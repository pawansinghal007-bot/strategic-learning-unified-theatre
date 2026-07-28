/**
 * tests/llm/gateway-mistake-context-integration.test.ts
 *
 * Sprint 106a — Real-store integration test for gateway rubric injection.
 * Closes: V4 (fully — Sprint 106 closed it at the mocked-unit-test level only)
 *
 * Nothing is mocked except the provider adapter's `ask` method (the genuine
 * external I/O boundary — an LLM call). ExperienceDb, request-context,
 * provider-policy, provider-health, and workspace-quotas all run against
 * real on-disk state in a temporary directory that is cleaned up in afterEach.
 *
 * Setup strategy (deviation from the sprint scaffold — documented):
 * ─────────────────────────────────────────────────────────────────
 * The sprint scaffold proposed `vi.resetModules()` + `process.env.HOME`
 * redirect. Investigation found two issues with that approach alone:
 *
 * 1. `ExperienceDb` constructor (experience-db.js lines 107-127) has an
 *    explicit Vitest-detection guard:
 *      if (!baseDir && VITEST && (HOME == null || HOME === os.homedir()))
 *        → redirect to ~/.vscode-rotator-test-dir/<pid>
 *    A mkdtempSync path (/tmp/...) is NEVER equal to os.homedir(), so
 *    setting HOME to tempHome DOES escape that branch correctly — the else
 *    branch fires and uses path.join(tempHome, ".vscode-rotator"). The
 *    HOME redirect approach therefore works as intended.
 *
 * 2. workspace-quotas.ts, routing-history.ts, provider-usage.ts all write
 *    via src/llm/storage.ts, which uses `os.homedir()` directly (not
 *    process.env.HOME). Redirecting HOME alone does NOT prevent those
 *    writes from reaching ~/.unified-ai-workspace. The fix is to also
 *    redirect UNIFIED_AI_DATA_DIR (storage.ts's override env var) to a
 *    sub-path inside the same temp directory. This keeps ALL writes
 *    inside tempHome and prevents any leakage to the real user's home.
 *
 * Both env vars are restored unconditionally in afterEach even if a test
 * throws, preventing cross-test contamination.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── types-only import for the dynamically-imported Gateway ─────────────────
import type { Gateway as GatewayType } from "../../src/llm/gateway.js";

// ─── module registry + env setup ────────────────────────────────────────────

let tempHome: string;
let originalHome: string | undefined;
let originalUnifiedAiDataDir: string | undefined;
let Gateway: typeof GatewayType;

beforeEach(async () => {
  // 1. Create an isolated temp directory that will hold all on-disk state for
  //    this test: ExperienceDb lives at tempHome/.vscode-rotator/experience.db
  //    and storage.ts writes live at tempHome/.unified-ai-workspace/.
  originalHome = process.env.HOME;
  originalUnifiedAiDataDir = process.env.UNIFIED_AI_DATA_DIR;

  tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "gateway-rubric-it-"));

  // 2. Redirect HOME so ExperienceDb constructor (appBaseDir) resolves to
  //    path.join(tempHome, ".vscode-rotator") via the else branch — the
  //    Vitest-detection guard fires only when HOME === os.homedir(), which
  //    a mkdtempSync path never satisfies.
  process.env.HOME = tempHome;

  // 3. Redirect UNIFIED_AI_DATA_DIR so that workspace-quotas.ts,
  //    routing-history.ts, and provider-usage.ts (all via storage.ts) also
  //    write inside tempHome rather than the real ~/.unified-ai-workspace.
  process.env.UNIFIED_AI_DATA_DIR = path.join(tempHome, ".unified-ai-workspace");

  // 4. Reset Vitest's module registry so gateway.ts is re-evaluated from
  //    scratch, ensuring its module-scoped `_experienceDb` lazy singleton
  //    (line 1021-1023: `_experienceDb ??= new ExperienceDb()`) constructs
  //    against the freshly redirected HOME rather than a previously cached
  //    instance from another test file's module load.
  vi.resetModules();

  // 5. Dynamically import the now-fresh gateway module. Static top-level
  //    imports cannot pick up a resetModules() call.
  const mod = await import("../../src/llm/gateway.js");
  Gateway = mod.Gateway;
});

afterEach(() => {
  // Restore env vars unconditionally — runs even if the test threw.
  process.env.HOME = originalHome;
  if (originalUnifiedAiDataDir === undefined) {
    delete process.env.UNIFIED_AI_DATA_DIR;
  } else {
    process.env.UNIFIED_AI_DATA_DIR = originalUnifiedAiDataDir;
  }

  // Remove the temp directory and all its contents.
  fs.rmSync(tempHome, { recursive: true, force: true });
});

// ─── helpers ────────────────────────────────────────────────────────────────

/** Minimal provider mock — the one genuine external I/O boundary. */
function makeLocalAdapter() {
  return {
    ask: vi.fn().mockResolvedValue({
      outputText: "Integration response",
      model: "local-model",
      finishReason: "stop",
    }),
    stream: vi.fn().mockImplementation(async function* () {
      yield { delta: "streamed ", provider: "local" };
    }),
  };
}

/** Standard request shape mirroring the other gateway test files. */
function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    prompt: "Fix the integration bug",
    userPrompt: "Fix the integration bug",
    requestId: `integration-test-${Date.now()}`,
    constraints: { maxTokens: 256, temperature: 0.5 },
    ...overrides,
  };
}

/**
 * Open a real ExperienceDb instance backed by the same temp directory that
 * the gateway's lazy singleton will use, seed one rubric rule, close it, and
 * return the ExperienceDb class for the round-trip assertion.
 *
 * We do NOT use a module-cached import here because vi.resetModules() was
 * called in beforeEach — a fresh dynamic import ensures we get the module
 * instance tied to the current tempHome, not a stale cached one.
 */
async function seedRubricRuleInTempStore(
  rule: string,
): Promise<{ ExperienceDb: unknown; dbPath: string }> {
  const { ExperienceDb } = await import("../../src/llm/experience-db.js");
  const dbPath = path.join(tempHome, ".vscode-rotator");
  const db = new (ExperienceDb as any)();  // no baseDir → uses HOME redirect
  await db.open();
  await db.addRubricRule({
    rule,
    category: "integration",
    active: 1,
  });
  await db.close();
  return { ExperienceDb, dbPath };
}

// ─── tests ──────────────────────────────────────────────────────────────────

const INTEGRATION_RULE =
  "Avoid repeating INTEGRATION mistake: real disk round-trip. Apply this fix: verify persistence.";

describe("gateway rubric injection — real ExperienceDb on-disk round-trip", () => {
  it("injects a seeded active rubric rule from the real on-disk store into the outgoing prompt", async () => {
    // Seed the rule into the real temp-directory ExperienceDb BEFORE
    // constructing the gateway — the gateway's singleton is not yet
    // instantiated at this point in the test.
    await seedRubricRuleInTempStore(INTEGRATION_RULE);

    const localAdapter = makeLocalAdapter();
    const gw = new Gateway({
      providers: { local: localAdapter },
      defaultOrder: ["local"],
    });

    // A workspaceId that does not exist in the fresh store is fine —
    // buildRequestContextPrompt returns null/empty gracefully on ENOENT.
    await gw.ask(makeRequest({ workspaceId: "ws-integration-106a" }));

    expect(localAdapter.ask).toHaveBeenCalledOnce();
    const sentPrompt: string = localAdapter.ask.mock.calls[0][0].prompt;

    // The real rubric injection code (gateway.ts ~line 466):
    //   rules.map(r => `- ${r.rule}`).join("\n")
    // so the exact text in the prompt is "- <rule text>"
    expect(sentPrompt).toContain(INTEGRATION_RULE);
  });

  it("round-trips: seeded rule survives a separate ExperienceDb.listRubricRules() read against the same temp store", async () => {
    // This is the Sprint 105a-style independent persistence proof:
    // seed via one db instance, read back via a fresh one, confirm
    // the data survived the write→close→open cycle on real disk.
    const { ExperienceDb } = await seedRubricRuleInTempStore(INTEGRATION_RULE);

    // Open a second, independent db instance pointing at the same path.
    const db2 = new (ExperienceDb as any)();
    await db2.open();
    const rules = await db2.listRubricRules({ activeOnly: true });
    await db2.close();

    expect(rules).toHaveLength(1);
    expect(rules[0].rule).toBe(INTEGRATION_RULE);
    expect(rules[0].category).toBe("integration");
    expect(rules[0].active).toBe(1);
  });
});
