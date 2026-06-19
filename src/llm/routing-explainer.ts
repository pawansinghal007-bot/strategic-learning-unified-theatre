import { detectSensitiveTask } from "../policies/sensitive-task-rules";
import { getProviderPolicy } from "../policies/provider-policy";

function getRoutingExplanation(
  request: {
    constraints?: {
      privacyMode?: string;
      requiresWeb?: boolean;
      preferredProvider?: string;
    };
    intent?: string;
  },
  provider: string,
  context: {
    fallbackFrom?: string;
    unavailableProviders?: string[];
    policyApplied?: boolean;
    policyReason?: string;
  },
  policy: {
    routingMode: string;
    manualProvider: string;
    blockedProviders: string[];
  },
  sensitive: { forceLocal: boolean; reasons: string[] },
): string | undefined {
  if (sensitive.forceLocal && provider === "local") {
    return `Selected local because sensitive task rules detected restricted content: ${sensitive.reasons.join(" ")}`;
  }

  if (context.fallbackFrom) {
    return `Selected ${provider} as fallback after ${context.fallbackFrom} became unavailable or failed.`;
  }

  if (request.constraints?.privacyMode === "local-only") {
    return "Selected local because privacy mode requires local-only execution.";
  }

  if (request.constraints?.requiresWeb && provider === "perplexity") {
    return "Selected Perplexity because the request requires web research.";
  }

  if (request.constraints?.preferredProvider === provider) {
    return `Selected ${provider} because it was explicitly preferred in request constraints.`;
  }

  if (policy.routingMode === "local-only") {
    return "Selected local because policy mode is local-only.";
  }

  if (policy.manualProvider === provider) {
    return `Selected ${provider} because it is manually pinned in policy settings.`;
  }

  if (context.policyApplied && policy.blockedProviders.length > 0) {
    return `Selected ${provider} after provider policy filtering removed blocked providers: ${policy.blockedProviders.join(", ")}.`;
  }

  if (context.policyReason) {
    return `Selected ${provider}. ${context.policyReason}`;
  }

  if (request.intent === "research" && provider === "perplexity") {
    return "Selected Perplexity because the request intent is research-oriented.";
  }

  if (request.intent === "summarization" && provider === "gemini") {
    return "Selected Gemini because it is prioritized for fast summarization.";
  }

  if (request.intent === "coding" && provider === "groq") {
    return "Selected Groq because it is prioritized for fast coding assistance.";
  }

  if (request.intent === "architecture" && provider === "openai") {
    return "Selected OpenAI because the request appears architecture-oriented.";
  }

  if (context.unavailableProviders?.length) {
    return `Selected ${provider} because higher-priority providers were unavailable: ${context.unavailableProviders.join(", ")}.`;
  }

  if (provider === "local") {
    return "Selected local model because no cloud provider was suitable or available.";
  }

  return undefined;
}

export function explainRoutingSelection(
  request: {
    constraints?: {
      privacyMode?: string;
      requiresWeb?: boolean;
      preferredProvider?: string;
    };
    intent?: string;
  },
  provider: string,
  context: {
    fallbackFrom?: string;
    unavailableProviders?: string[];
    policyApplied?: boolean;
    policyReason?: string;
  } = {},
) {
  const policy = getProviderPolicy();
  const sensitive = detectSensitiveTask(request);
  const explanation = getRoutingExplanation(
    request,
    provider,
    context,
    policy,
    sensitive,
  );
  return explanation ?? `Selected ${provider} by default routing priority.`;
}
