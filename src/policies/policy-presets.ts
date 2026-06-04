const CLOUD_PROVIDERS = ['groq', 'gemini', 'openai', 'perplexity'];
const ALL_PROVIDERS = ['groq', 'gemini', 'openai', 'perplexity', 'local'];

export const POLICY_PRESETS = {
  default: {
    name: 'default',
    label: 'Default',
    description: 'Balanced cloud routing with no special restrictions.',
    policy: {
      routingMode: 'cloud',
      allowedProviders: [...CLOUD_PROVIDERS],
      blockedProviders: [],
      manualProvider: null,
    },
  },
  coding: {
    name: 'coding',
    label: 'Coding mode',
    description: 'Prefer fast coding providers while keeping cloud fallback available.',
    policy: {
      routingMode: 'hybrid',
      allowedProviders: ['groq', 'openai', 'gemini', 'local'],
      blockedProviders: ['perplexity'],
      manualProvider: 'groq',
    },
  },
  research: {
    name: 'research',
    label: 'Research mode',
    description: 'Prefer research and summarization providers.',
    policy: {
      routingMode: 'cloud',
      allowedProviders: ['perplexity', 'gemini', 'openai'],
      blockedProviders: ['groq', 'local'],
      manualProvider: 'perplexity',
    },
  },
  private: {
    name: 'private',
    label: 'Private mode',
    description: 'Route only to local for privacy-sensitive tasks.',
    policy: {
      routingMode: 'local-only',
      allowedProviders: ['local'],
      blockedProviders: [],
      manualProvider: 'local',
    },
  },
  enterprise: {
    name: 'enterprise',
    label: 'Enterprise mode',
    description: 'Conservative approved-provider set with local fallback.',
    policy: {
      routingMode: 'hybrid',
      allowedProviders: ['openai', 'gemini', 'local'],
      blockedProviders: ['groq', 'perplexity'],
      manualProvider: null,
    },
  },
};

export function listPolicyPresets() {
  return Object.values(POLICY_PRESETS);
}

export function getPolicyPreset(name) {
  const preset = POLICY_PRESETS[name];
  if (!preset) throw new Error(`Unknown policy preset: ${name}`);
  return preset;
}

export function isPolicyPresetName(value) {
  return value in POLICY_PRESETS;
}

export function getAllProviders() {
  return [...ALL_PROVIDERS];
}
