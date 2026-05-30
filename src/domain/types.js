/**
 * domain/types.js
 * Type re-exports and aliases for domain entities.
 * Used by consumers that need type hints without TypeScript.
 * ESM module with JSDoc type annotations.
 */

import { z } from 'zod';

export {
  AccountSchema,
  AgentTypeSchema,
  AccountStatusSchema,
  IsoDateString,
  VscodeLearnConfigSchema,
  CaptureScheduleSchema,
  AppConfigSchema,
  parseAppConfig,
  SprintAgentSchema,
  SprintStatusSchema,
  SprintTaskPriority,
  CompletedTaskSchema,
  PendingTaskSchema,
  BlockerSchema,
  TestFailureSchema,
  HandoffSprintSchema,
  IdeaStatusSchema,
  IdeaPrioritySchema,
  IdeaSchema,
  BrowserCapturePayloadSchema,
  HealthStatusSchema,
  RobotRunResultSchema,
  HandoffStatusSchema,
  PositiveIntSchema,
  BrowserPlatformSchema,
  BrowserTypeSchema,
  TimeoutMsSchema
} from './schemas.js';

// Re-export error classes from src/error.js
export {
  DomainError,
  isDomainError,
  createConfigError,
  createIpcPayloadError
} from '../error.js';

// ============================================================================
// JSDoc TYPE ALIASES
// ============================================================================

/**
 * @typedef {z.infer<typeof AccountSchema>} Account
 * User account with encrypted auth blob and status tracking.
 */

/**
 * @typedef {z.infer<typeof AppConfigSchema>} AppConfig
 * Complete application configuration object.
 */

/**
 * @typedef {z.infer<typeof VscodeLearnConfigSchema>} VscodeLearnConfig
 * VSCode signal capture configuration.
 */

/**
 * @typedef {z.infer<typeof CaptureScheduleSchema>} CaptureSchedule
 * Automated capture scheduling configuration.
 */

/**
 * @typedef {z.infer<typeof HandoffSprintSchema>} HandoffSprint
 * Agent sprint state and tracking.
 */

/**
 * @typedef {z.infer<typeof CompletedTaskSchema>} CompletedTask
 * Successfully completed sprint task.
 */

/**
 * @typedef {z.infer<typeof PendingTaskSchema>} PendingTask
 * Queued sprint task awaiting execution.
 */

/**
 * @typedef {z.infer<typeof BlockerSchema>} Blocker
 * Sprint execution blocker.
 */

/**
 * @typedef {z.infer<typeof TestFailureSchema>} TestFailure
 * Test execution failure with error details.
 */

/**
 * @typedef {z.infer<typeof IdeaSchema>} Idea
 * Feature request or design idea.
 */

/**
 * @typedef {z.infer<typeof BrowserCapturePayloadSchema>} BrowserCapturePayload
 * Structure of captured browser responses.
 */

/**
 * @typedef {z.infer<typeof HealthStatusSchema>} HealthStatus
 * System health check result.
 */

/**
 * @typedef {z.infer<typeof RobotRunResultSchema>} RobotRunResult
 * Robot framework test run result.
 */

/**
 * @typedef {'claude' | 'chatgpt' | 'gemini' | 'perplexity' | 'other'} SprintAgent
 * Supported AI agent identifiers.
 */

/**
 * @typedef {'active' | 'paused' | 'exhausted' | 'complete'} SprintStatus
 * Sprint execution status.
 */

/**
 * @typedef {1 | 2 | 3} Priority
 * Task or idea priority (1=high, 3=low).
 */

/**
 * @typedef {'inbox' | 'active' | 'parked' | 'done'} IdeaStatus
 * Idea lifecycle state.
 */

/**
 * @typedef {'chromium' | 'firefox' | 'webkit'} BrowserPlatform
 * Playwright browser platform.
 */

/**
 * @typedef {'chrome' | 'firefox' | 'safari' | 'edge' | 'brave'} BrowserType
 * Browser family.
 */
