// src/shared/schemas/provider.schema.ts
import { z } from "zod";

export const providerNameSchema = z.enum([
  "openai",
  "anthropic",
  "gemini",
  "groq",
  "perplexity",
  "local",
  "custom",
]);

export const providerCapabilitySchema = z.enum([
  "chat",
  "streaming",
  "tool_use",
  "web_research",
  "reasoning",
  "summarization",
  "code_generation",
  "embeddings",
  "vision",
  "offline",
  "private_mode",
]);

export const workspaceIntentSchema = z.enum([
  "coding",
  "architecture",
  "research",
  "summarization",
  "planning",
  "debugging",
  "tool_use",
  "analysis",
  "general",
]);

export const privacyModeSchema = z.enum(["cloud", "hybrid", "local-only"]);

export const providerRequestConstraintsSchema = z.object({
  maxTokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
  timeoutMs: z.number().int().positive().optional(),
  budgetTier: z.enum(["low", "balanced", "premium"]).optional(),
  privacyMode: privacyModeSchema.optional(),
  requiresWeb: z.boolean().optional(),
  requiresTools: z.boolean().optional(),
  preferredProvider: providerNameSchema.optional(),
  excludedProviders: z.array(providerNameSchema).optional(),
});

export const providerRequestSchema = z.object({
  requestId: z.string().min(1),
  workspaceId: z.string().min(1).optional(),
  prompt: z.string().min(1),
  systemPrompt: z.string().optional(),
  intent: workspaceIntentSchema.optional(),
  context: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  constraints: providerRequestConstraintsSchema.optional(),
  stream: z.boolean().optional(),
});

export const providerUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional(),
  estimatedCostUsd: z.number().nonnegative().optional(),
  latencyMs: z.number().int().nonnegative().optional(),
});

export const routingReasonSchema = z.object({
  code: z.enum([
    "preferred_provider",
    "capability_match",
    "health_preference",
    "quota_fallback",
    "latency_preference",
    "privacy_constraint",
    "manual_override",
    "default_selection",
    "policy_source",
  ]),
  message: z.string().min(1),
});

export const providerResponseSchema = z.object({
  requestId: z.string().min(1),
  provider: providerNameSchema,
  model: z.string().min(1),
  outputText: z.string(),
  finishReason: z
    .enum(["stop", "length", "tool_call", "error", "unknown"])
    .optional(),
  usage: providerUsageSchema.optional(),
  routingReasons: z.array(routingReasonSchema).optional(),
  raw: z.unknown().optional(),
});

export const tokenChunkSchema = z.object({
  requestId: z.string().min(1),
  provider: providerNameSchema,
  delta: z.string(),
  done: z.boolean().optional(),
});

export const providerHealthSchema = z.object({
  provider: providerNameSchema,
  available: z.boolean(),
  status: z.enum([
    "healthy",
    "degraded",
    "rate_limited",
    "auth_error",
    "offline",
    "unknown",
  ]),
  latencyMs: z.number().int().nonnegative().optional(),
  lastCheckedAt: z.string().optional(),
  message: z.string().optional(),
});

export type ProviderRequestInput = z.infer<typeof providerRequestSchema>;
export type ProviderResponseInput = z.infer<typeof providerResponseSchema>;
