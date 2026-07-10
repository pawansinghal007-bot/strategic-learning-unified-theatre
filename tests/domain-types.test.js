/**
 * Tests for src/domain/types.js
 * The file is a pure re-export barrel. The meaningful behavioral contract is:
 * every named export from types.js is the exact same reference as the
 * corresponding export from the originating source module.
 * This catches omissions, typos, or broken re-exports that would silently
 * export `undefined` to callers.
 */

import { describe, it, expect } from "vitest";

// Import the barrel under test
import * as domainTypes from "../src/domain/types.js";

// Import the originating modules directly for reference comparison
import * as schemas from "../src/domain/schemas.js";
import * as errorModule from "../src/error.js";

describe("domain/types.js re-exports from schemas.js", () => {
  const schemaExports = [
    "AccountSchema",
    "AgentTypeSchema",
    "AccountStatusSchema",
    "IsoDateString",
    "VscodeLearnConfigSchema",
    "CaptureScheduleSchema",
    "AppConfigSchema",
    "parseAppConfig",
    "SprintAgentSchema",
    "SprintStatusSchema",
    "SprintTaskPriority",
    "CompletedTaskSchema",
    "PendingTaskSchema",
    "BlockerSchema",
    "TestFailureSchema",
    "HandoffSprintSchema",
    "IdeaStatusSchema",
    "IdeaPrioritySchema",
    "IdeaSchema",
    "BrowserCapturePayloadSchema",
    "HealthStatusSchema",
    "RobotRunResultSchema",
    "HandoffStatusSchema",
    "PositiveIntSchema",
    "BrowserPlatformSchema",
    "BrowserTypeSchema",
    "TimeoutMsSchema",
  ];

  for (const name of schemaExports) {
    it(`exports ${name} as the same reference as schemas.js`, () => {
      // Not just "it's defined" — it must be the exact same object/function
      // reference so callers can use either import path interchangeably.
      expect(domainTypes[name]).toBe(schemas[name]);
    });
  }
});

describe("domain/types.js re-exports from error.js", () => {
  const errorExports = [
    "DomainError",
    "isDomainError",
    "createConfigError",
    "createIpcPayloadError",
  ];

  for (const name of errorExports) {
    it(`exports ${name} as the same reference as error.js`, () => {
      expect(domainTypes[name]).toBe(errorModule[name]);
    });
  }
});
