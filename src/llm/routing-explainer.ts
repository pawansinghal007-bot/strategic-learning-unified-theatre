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
  } = {},
) {
  if (request.constraints?.privacyMode === "local-only") {
    return "Selected local because privacy mode requires local-only execution.";
  }

  if (request.constraints?.requiresWeb && provider === "perplexity") {
    return "Selected Perplexity because the request requires web research.";
  }

  if (request.constraints?.preferredProvider === provider) {
    return `Selected ${provider} because it was explicitly preferred in request constraints.`;
  }

  if (context.fallbackFrom) {
    return `Selected ${provider} as fallback after ${context.fallbackFrom} became unavailable or failed.`;
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

  if (provider === "local") {
    return "Selected local model because no cloud provider was suitable or available.";
  }

  if (context.unavailableProviders?.length) {
    return `Selected ${provider} because higher-priority providers were unavailable: ${context.unavailableProviders.join(", ")}.`;
  }

  return `Selected ${provider} by default routing priority.`;
}
