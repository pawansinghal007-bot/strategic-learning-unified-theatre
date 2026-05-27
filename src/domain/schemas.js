/**
 * domain/schemas.js
 * Centralized Zod schemas for all domain entities and boundaries.
 * Single source of truth for data validation across process boundaries.
 */

import { z } from "zod";

// Re-export existing schemas from src/accounts/schema.js
export {
  AccountSchema,
  AgentTypeSchema,
  AccountStatusSchema,
} from "../accounts/schema.js";

/**
 * Helper: ISO 8601 date string validator.
 * Validates that a string is a parseable ISO date.
 */
export const IsoDateString = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Invalid ISO date string",
  });

// ============================================================================
// CONFIG SCHEMAS
// ============================================================================

/**
 * VscodeLearnConfigSchema — configuration for VSCode signal capture.
 */
export const VscodeLearnConfigSchema = z.object({
  enabled: z.boolean().default(false),
  stagedSignalsDir: z.string().nullable().default(null),
  captureSources: z
    .array(z.string())
    .default(["diagnostic", "editor", "task", "git"]),
  maxSignalAgeDays: z.number().nonnegative().default(30),
  flushIntervalMs: z.number().positive().default(30000),
  debounceMs: z.number().positive().default(600000),
  maxFileSizeBytes: z.number().positive().default(102400),
  excludePatterns: z
    .array(z.string())
    .default(["**/test/**", "**/fixtures/**"]),
  hardExcludePatterns: z
    .array(z.string())
    .default([
      "**/.env*",
      "**/*.key",
      "**/*.pem",
      "**/*.secret",
      "**/node_modules/**",
      "**/.git/**",
      "**/dist/**",
      "**/build/**",
    ]),
  allowedExtensions: z
    .array(z.string())
    .default([
      ".js",
      ".ts",
      ".jsx",
      ".tsx",
      ".py",
      ".md",
      ".json",
      ".yaml",
      ".yml",
      ".txt",
    ]),
});

/**
 * CaptureScheduleSchema — automated capture scheduling.
 */
export const CaptureScheduleSchema = z.object({
  enabled: z.boolean().default(false),
  intervalMs: z
    .number()
    .positive()
    .default(15 * 60 * 1000),
});

/**
 * AppConfigSchema — complete application configuration.
 */
export const AppConfigSchema = z.object({
  watchedRepos: z.array(z.string()).default([]),
  gitPollIntervalMs: z.number().positive().default(30000),
  storagePaths: z.array(z.string()).default([]),
  storageIndexMaxAgeDays: z.number().nonnegative().default(30),
  browserResponsesIngest: z.boolean().default(true),
  enhanceSchedule: z.unknown().nullable().default(null),
  vscodeLearn: VscodeLearnConfigSchema.default({}),
  browserPaths: z.record(z.string()).default({}),
  platformTriggers: z.record(z.string()).default({}),
  captureSchedule: CaptureScheduleSchema.default({}),
});

/**
 * Parse and validate application config.
 * @param {unknown} raw - Raw config object
 * @returns {z.infer<typeof AppConfigSchema>}
 */
export function parseAppConfig(raw) {
  return AppConfigSchema.parse(raw);
}

// ============================================================================
// SPRINT/HANDOFF SCHEMAS
// ============================================================================

/**
 * SprintAgentSchema — AI agent identifier.
 */
export const SprintAgentSchema = z.enum([
  "claude",
  "chatgpt",
  "gemini",
  "perplexity",
  "other",
]);

/**
 * SprintStatusSchema — current sprint execution status.
 */
export const SprintStatusSchema = z.enum([
  "active",
  "paused",
  "exhausted",
  "complete",
]);

/**
 * SprintTaskPriority — numeric priority (1=high, 3=low).
 */
export const SprintTaskPriority = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);

/**
 * CompletedTaskSchema — successfully finished task within a sprint.
 */
export const CompletedTaskSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  filesChanged: z.array(z.string()).default([]),
});

/**
 * PendingTaskSchema — task queued for execution.
 */
export const PendingTaskSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  priority: SprintTaskPriority,
});

/**
 * BlockerSchema — obstacle preventing task completion.
 */
export const BlockerSchema = z.object({
  description: z.string().min(1),
  suggestedFix: z.string().min(1),
});

/**
 * TestFailureSchema — failed test with error details.
 */
export const TestFailureSchema = z.object({
  name: z.string().min(1),
  error: z.string().min(1),
});

/**
 * HandoffSprintSchema — agent sprint tracking and state.
 * Matches the SprintSchema from src/agent-handoff.js.
 */
export const HandoffSprintSchema = z.object({
  sprintId: z.string().uuid(),
  date: IsoDateString,
  agent: SprintAgentSchema,
  model: z.string().min(1),
  goal: z.string().min(1),
  tokensUsed: z.number().nonnegative(),
  tokensLimit: z.number().nonnegative(),
  status: SprintStatusSchema,
  completedTasks: z.array(CompletedTaskSchema).default([]),
  pendingTasks: z.array(PendingTaskSchema).default([]),
  blockers: z.array(BlockerSchema).default([]),
  filesCreated: z.array(z.string()).default([]),
  filesModified: z.array(z.string()).default([]),
  testsPassed: z.array(z.string()).default([]),
  testsFailed: z.array(TestFailureSchema).default([]),
  resumePrompt: z.string().default(""),
});

// ============================================================================
// IDEA/FEATURE REQUEST SCHEMAS
// ============================================================================

/**
 * IdeaStatusSchema — idea lifecycle state.
 */
export const IdeaStatusSchema = z.enum(["inbox", "active", "parked", "done"]);

/**
 * IdeaPrioritySchema — priority level (1=high, 3=low).
 */
export const IdeaPrioritySchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);

/**
 * IdeaSchema — feature request or design idea.
 * Matches IdeaSchema from src/idea-store.js.
 */
export const IdeaSchema = z.object({
  id: z.string().uuid(),
  created: IsoDateString,
  project: z.string().min(1),
  tags: z.array(z.string()).default([]),
  status: IdeaStatusSchema,
  priority: IdeaPrioritySchema,
  linkedSprint: z.string().uuid().nullable().default(null),
});

// ============================================================================
// BROWSER CAPTURE SCHEMAS
// ============================================================================

/**
 * BrowserCapturePayloadSchema — structure of captured browser responses.
 * Used by electron-ui/ipc/capture-handlers.cjs.
 * Note: ts is milliseconds since epoch (positive integer).
 */
export const BrowserCapturePayloadSchema = z.object({
  platform: z.string().min(1),
  html: z.string(),
  text: z.string(),
  url: z.string().url(),
  ts: z.number().int().positive().describe("milliseconds since epoch"),
});

// ============================================================================
// HEALTH & EXECUTION SCHEMAS
// ============================================================================

/**
 * HealthStatusSchema — system health check result.
 */
export const HealthStatusSchema = z.enum(["healthy", "degraded", "unhealthy"]);

/**
 * RobotRunResultSchema — result of a robot framework test run.
 */
export const RobotRunResultSchema = z.object({
  passed: z.number().nonnegative(),
  failed: z.number().nonnegative(),
  elapsed: z.number().nonnegative().describe("milliseconds"),
  output: z.string().default(""),
});

// ============================================================================
// CLI SCHEMAS
// ============================================================================

/**
 * HandoffStatusSchema — CLI status display enum.
 */
export const HandoffStatusSchema = z.enum([
  "active",
  "paused",
  "exhausted",
  "complete",
]);

/**
 * PositiveIntSchema — validates a positive integer.
 */
export const PositiveIntSchema = z.number().int().positive();

/**
 * BrowserPlatformSchema — supported browser platforms.
 */
export const BrowserPlatformSchema = z.enum(["chromium", "firefox", "webkit"]);

/**
 * BrowserTypeSchema — supported browser families.
 */
export const BrowserTypeSchema = z.enum([
  "chrome",
  "firefox",
  "safari",
  "edge",
  "brave",
]);

/**
 * TimeoutMsSchema — validates timeout in milliseconds (non-negative).
 */
export const TimeoutMsSchema = z
  .number()
  .nonnegative()
  .describe("milliseconds");
