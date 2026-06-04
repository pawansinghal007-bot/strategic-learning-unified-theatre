export {};

declare global {
  interface Window {
    providerTelemetry: {
      getStatus: () => Promise<any[]>;
      getUsage: () => Promise<any[]>;
      resetHealth: (provider?: string) => Promise<{ ok: true }>;
      resetUsage: (provider?: string) => Promise<{ ok: true }>;
      resetAll: (provider?: string) => Promise<{ ok: true }>;
      getRoutingHistory: (limit?: number) => Promise<any[]>;
      resetRoutingHistory: () => Promise<{ ok: true }>;
    };
    providerPolicy: {
      get: () => Promise<any>;
      listPresets: () => Promise<any[]>;
      applyPreset: (name: string) => Promise<any>;
      setMode: (mode: "cloud" | "hybrid" | "local-only") => Promise<any>;
      allow: (provider: string) => Promise<any>;
      block: (provider: string) => Promise<any>;
      setManualProvider: (provider: string | null) => Promise<any>;
      reset: () => Promise<any>;
    };
  }
}
