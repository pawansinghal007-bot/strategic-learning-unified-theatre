import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { DomainError } from "../error.js";

function homeDir() {
  return process.env.HOME || os.homedir();
}

async function exists(p) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

export function configPath() {
  return path.join(homeDir(), ".vscode-rotator", "config.json");
}

export const DEFAULT_CONFIG = {
  watchedRepos: [],
  gitPollIntervalMs: 30000,
  storagePaths: [],
  storageIndexMaxAgeDays: 30,
  browserResponsesIngest: true,
  enhanceSchedule: null,
  vscodeLearn: {
    enabled: false,
    stagedSignalsDir: null,
    captureSources: ["diagnostic", "editor", "task", "git"],
    maxSignalAgeDays: 30,
    flushIntervalMs: 30000,
    debounceMs: 600000,
    maxFileSizeBytes: 102400,
    excludePatterns: ["**/test/**", "**/fixtures/**"],
    hardExcludePatterns: [
      "**/.env*",
      "**/*.key",
      "**/*.pem",
      "**/*.secret",
      "**/node_modules/**",
      "**/.git/**",
      "**/dist/**",
      "**/build/**",
    ],
    allowedExtensions: [
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
    ],
  },
  policy: {
    apiVersion: "1",
    pluginSearchPaths: [],
    features: {
      localDbEnabled: true,
      browserCaptureEnabled: true,
      llmCommandsEnabled: true,
    },
  },
  // Browser integration settings
  browserPaths: {},
  platformTriggers: {
    // domain -> platform mapping example
    // "chat.openai.com": "chatgpt",
    // "cloud.ai": "claude",
    // "perplexity.ai": "perplexity",
    // "gemini.google.com": "gemini"
  },
  captureSchedule: {
    enabled: false,
    intervalMs: 15 * 60 * 1000, // default 15 minutes
  },
};

/**
 * ConfigSchema — Zod schema for app configuration validation.
 * Mirrors DEFAULT_CONFIG structure with type validation and coercion.
 */
const VscodeLearnConfigSchema = z.object({
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

const CaptureScheduleSchema = z.object({
  enabled: z.boolean().default(false),
  intervalMs: z
    .number()
    .positive()
    .default(15 * 60 * 1000),
});

/**
 * PolicySchema — Enterprise policy configuration with optional overrides.
 */
const PolicySchema = z
  .object({
    apiVersion: z.string().default("1"),
    allowedPlatforms: z.array(z.string()).optional(),
    allowedModels: z.array(z.string()).optional(),
    rateLimits: z
      .object({
        perPlatformPerMinute: z.number().int().positive().optional(),
        perModelPerMinute: z.number().int().positive().optional(),
      })
      .optional(),
    watchRepos: z
      .array(
        z.object({
          path: z.string(),
          branch: z.string().default("main"),
        }),
      )
      .optional(),
    features: z
      .object({
        localDbEnabled: z.boolean().default(true),
        browserCaptureEnabled: z.boolean().default(true),
        llmCommandsEnabled: z.boolean().default(true),
      })
      .default({}),
    pluginSearchPaths: z.array(z.string()).optional(),
  })
  .default({});

const ConfigSchema = z.object({
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
  policy: PolicySchema,
});

export { ConfigSchema };

/**
 * Returns candidate paths for enterprise config in order of precedence.
 */
function enterpriseConfigCandidates() {
  return [
    process.env.UNIFIED_THEATRE_ENTERPRISE_CONFIG,
    "/etc/strategic-learning-unified-theatre/enterprise-policy.json",
    "/etc/strategic-learning-unified-theatre/enterprise-policy.yaml",
  ].filter(Boolean);
}

/**
 * Attempts to load and parse enterprise config from candidate paths.
 * Tries each candidate in order; returns first successfully parsed object or null.
 */
async function loadEnterpriseConfigOverride() {
  const candidates = enterpriseConfigCandidates();

  for (const filePath of candidates) {
    try {
      const content = await fs.readFile(filePath, "utf8");

      // Handle YAML files
      if (filePath.endsWith(".yaml") || filePath.endsWith(".yml")) {
        try {
          const yaml = await import("yaml");
          return yaml.parse(content);
        } catch (err) {
          console.warn(
            `[config] Failed to parse YAML from ${filePath}:`,
            String(err),
          );
          continue;
        }
      }

      // Handle JSON files (default)
      try {
        return JSON.parse(content);
      } catch (err) {
        console.warn(
          `[config] Failed to parse JSON from ${filePath}:`,
          String(err),
        );
        continue;
      }
    } catch (err) {
      // File not readable; silently skip to next candidate
      continue;
    }
  }

  return null;
}

async function readConfigFile(path, isStrict) {
  try {
    return await fs.readFile(path, "utf8");
  } catch (err) {
    const message = `Failed to read config file: ${path}`;

    if (isStrict) {
      throw new DomainError("ROTATOR_CONFIG_INVALID", message, {
        path,
        error: String(err),
      });
    }

    console.warn(`[config] ${message} — using defaults`);
    return null;
  }
}

function parseUserConfig(raw, path, isStrict) {
  if (!raw) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const json = JSON.parse(raw);
    return {
      ...DEFAULT_CONFIG,
      ...json,
      vscodeLearn: {
        ...DEFAULT_CONFIG.vscodeLearn,
        ...(json?.vscodeLearn),
      },
    };
  } catch (err) {
    const message = `Invalid JSON in config file: ${path}`;

    if (isStrict) {
      throw new DomainError("ROTATOR_CONFIG_INVALID", message, {
        path,
        error: String(err),
      });
    }

    console.warn(`[config] ${message} — using defaults`);
    return { ...DEFAULT_CONFIG };
  }
}

export async function loadConfig() {
  const p = configPath();

  const isStrict =
    process.env.ROTATOR_CONFIG_STRICT !== "0" &&
    process.env.ROTATOR_CONFIG_STRICT !== "false";

  // Load user config (file or defaults)
  let userConfig = { ...DEFAULT_CONFIG };

  if (await exists(p)) {
    const raw = await readConfigFile(p, isStrict);
    userConfig = parseUserConfig(raw, p, isStrict);
  }

  // Load enterprise override if available
  let enterpriseOverride = null;

  try {
    enterpriseOverride = await loadEnterpriseConfigOverride();
  } catch (err) {
    console.warn(`[config] Error loading enterprise config:`, String(err));
  }

  // Merge: DEFAULT_CONFIG → userConfig → enterpriseOverride
  const merged = {
    ...userConfig,
    ...(enterpriseOverride),

    vscodeLearn: {
      ...userConfig.vscodeLearn,
      ...(enterpriseOverride?.vscodeLearn),
    },

    policy: {
      ...userConfig.policy,
      ...(enterpriseOverride?.policy),
    },
  };

  // Validate merged config against schema
  const result = ConfigSchema.safeParse(merged);

  if (!result.success) {
    const issues = result.error?.issues || [];

    const errorMessages = issues
      .map((e) => `${e.path.join(".")}: ${e.message}`)
      .join("; ");

    const message = `Invalid configuration/policy. Startup aborted. Validation failed: ${errorMessages}`;

    if (isStrict) {
      throw new DomainError("ROTATOR_CONFIG_INVALID", message, { issues });
    }

    console.warn(`[config] ${message} — using defaults`);
    return structuredClone(DEFAULT_CONFIG);
  }

  return result.data;
}

export async function saveConfig(next) {
  const p = configPath();
  await fs.mkdir(path.dirname(p), { recursive: true, mode: 0o700 });
  const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(next ?? {}, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
  try {
    await fs.rename(tmp, p);
  } catch {
    try {
      await fs.unlink(p);
    } catch {}
    await fs.rename(tmp, p);
  }
}

/**
 * Asserts that a feature is enabled in the provided config.
 * Throws if the feature is disabled via policy.
 *
 * @param {Object} cfg - Loaded configuration object
 * @param {string} featureKey - Feature key (e.g., "localDbEnabled")
 * @param {string} [context] - Optional context string for error message
 * @throws {Error} if feature is disabled
 */
export function assertFeatureEnabled(cfg, featureKey, context) {
  if (cfg?.policy?.features?.[featureKey] === false) {
    throw new Error(
      `Feature "${featureKey}" is disabled by policy${context ? ` (${context})` : ""}.`,
    );
  }
}
