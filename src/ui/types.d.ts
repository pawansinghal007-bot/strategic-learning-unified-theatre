export {};

declare global {
  interface Window {
    providerTelemetry: {
      getStatus: () => Promise<any[]>;
      getUsage: () => Promise<any[]>;
      resetHealth: (provider?: string) => Promise<{ ok: true }>;
      resetUsage: (provider?: string) => Promise<{ ok: true }>;
      resetAll: (provider?: string) => Promise<{ ok: true }>;
    };
  }
}
