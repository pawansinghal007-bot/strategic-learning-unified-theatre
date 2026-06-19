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
  const explanation =
    getSensitiveTaskExplanation(sensitive, provider) ??
    getFallbackExplanation(context, provider) ??
    getPrivacyModeExplanation(request, provider) ??
    getWebResearchExplanation(request, provider) ??
    getPreferredProviderExplanation(request, provider) ??
    getPolicyModeExplanation(policy, provider) ??
    getManualProviderExplanation(policy, provider) ??
    getPolicyFilteringExplanation(context, policy, provider) ??
    getPolicyReasonExplanation(context, provider) ??
    getIntentBasedExplanation(request, provider) ??
    getUnavailableProvidersExplanation(context, provider) ??
    getDefaultLocalExplanation(provider);

  return explanation;
}

function getSensitiveTaskExplanation(
  sensitive: { forceLocal: boolean; reasons: string[] },
  provider: string,
): string | undefined {
  if (sensitive.forceLocal && provider === "local") {
    return `Selected local because sensitive task rules detected restricted content: ${sensitive.reasons.join(" ")}`;
  }
  return undefined;
}

function getFallbackExplanation(
  context: { fallbackFrom?: string },
  provider: string,
): string | undefined {
  if (context.fallbackFrom) {
    return `Selected ${provider} as fallback after ${context.fallbackFrom} became unavailable or failed.`;
  }
  return undefined;
}

function getPrivacyModeExplanation(
  request: { constraints?: { privacyMode?: string } },
  provider: string,
): string | undefined {
  if (request.constraints?.privacyMode === "local-only") {
    return "Selected local because privacy mode requires local-only execution.";
  }
  return undefined;
}

function getWebResearchExplanation(
  request: { constraints?: { requiresWeb?: boolean } },
  provider: string,
): string | undefined {
  if (request.constraints?.requiresWeb && provider === "perplexity") {
    return "Selected Perplexity because the request requires web research.";
  }
  return undefined;
}

function getPreferredProviderExplanation(
  request: { constraints?: { preferredProvider?: string } },
  provider: string,
): string | undefined {
  if (request.constraints?.preferredProvider === provider) {
    return `Selected ${provider} because it was explicitly preferred in request constraints.`;
  }
  return undefined;
}

function getPolicyModeExplanation(
  policy: { routingMode: string },
  provider: string,
): string | undefined {
  if (policy.routingMode === "local-only") {
    return "Selected local because policy mode is local-only.";
  }
  return undefined;
}

function getManualProviderExplanation(
  policy: { manualProvider: string },
  provider: string,
): string | undefined {
  if (policy.manualProvider === provider) {
    return `Selected ${provider} because it is manually pinned in policy settings.`;
  }
  return undefined;
}

function getPolicyFilteringExplanation(
  context: { policyApplied?: boolean },
  policy: { blockedProviders: string[] },
  provider: string,
): string | undefined {
  if (context.policyApplied && policy.blockedProviders.length > 0) {
    return `Selected ${provider} after provider policy filtering removed blocked providers: ${policy.blockedProviders.join(", ")}.`;
  }
  return undefined;
}

function getPolicyReasonExplanation(
  context: { policyReason?: string },
  provider: string,
): string | undefined {
  if (context.policyReason) {
    return `Selected ${provider}. ${context.policyReason}`;
  }
  return undefined;
}

function getIntentBasedExplanation(
  request: { intent?: string },
  provider: string,
): string | undefined {
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
  return undefined;
}

function getUnavailableProvidersExplanation(
  context: { unavailableProviders?: string[] },
  provider: string,
): string | undefined {
  if (context.unavailableProviders?.length) {
    return `Selected ${provider} because higher-priority providers were unavailable: ${context.unavailableProviders.join(", ")}.`;
  }
  return undefined;
}

function getDefaultLocalExplanation(provider: string): string | undefined {
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
