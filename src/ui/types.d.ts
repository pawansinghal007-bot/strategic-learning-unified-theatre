export {};

declare global {
  interface Window {
    providerTelemetry: {
      getStatus: () => Promise<any[]>;
      getUsage: () => Promise<any[]>;
      getRoutingHistory: (limit?: number) => Promise<any[]>;
      resetHealth: (provider?: string) => Promise<{ ok: true }>;
      resetUsage: (provider?: string) => Promise<{ ok: true }>;
      resetAll: (provider?: string) => Promise<{ ok: true }>;
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
    workspacePolicy: {
      get: (workspaceId: string) => Promise<any | null>;
      resolve: (workspaceId: string) => Promise<{
        policy: any;
        source: "global" | "workspace";
        workspaceId?: string;
      }>;
      set: (workspaceId: string, policy: Record<string, any>) => Promise<any>;
      clear: (workspaceId: string) => Promise<boolean>;
      list: () => Promise<any[]>;
    };
    workspaceContext: {
      get: (workspaceId: string) => Promise<any | null>;
      set: (
        workspaceId: string,
        payload: {
          summary: string;
          tags?: string[];
          lastIntent?: string;
        },
      ) => Promise<any>;
      clear: (workspaceId: string) => Promise<boolean>;
      buildPrompt: (workspaceId: string) => Promise<string | null>;
    };
    workspaceRouting: {
      list: (workspaceId: string, limit?: number) => Promise<any[]>;
      summary: (workspaceId: string) => Promise<{
        workspaceId: string;
        total: number;
        successCount: number;
        failureCount: number;
        successRate: number;
        avgLatencyMs: number;
        errorRate: number;
        providerCounts: Record<string, number>;
        latest: any | null;
      }>;
      trends: (workspaceId: string) => Promise<
        Array<{
          provider: string;
          count: number;
          successCount: number;
          failureCount: number;
          avgLatencyMs: number;
        }>
      >;
      timeline: (
        workspaceId: string,
        limit?: number,
      ) => Promise<
        Array<{
          id: string;
          timestamp: number;
          title: string;
          detail: string;
          severity: "info" | "warning" | "error";
          provider: string;
          success: boolean;
          workspaceId: string | null;
        }>
      >;
      analytics: (workspaceId: string) => Promise<{
        summary: {
          workspaceId: string;
          total: number;
          successCount: number;
          failureCount: number;
          successRate: number;
          avgLatencyMs: number;
          errorRate: number;
          providerCounts: Record<string, number>;
          latest: any | null;
        };
        trends: Array<{
          provider: string;
          count: number;
          successCount: number;
          failureCount: number;
          avgLatencyMs: number;
        }>;
        timeline: Array<{
          id: string;
          timestamp: number;
          title: string;
          detail: string;
          severity: "info" | "warning" | "error";
          provider: string;
          success: boolean;
          workspaceId: string | null;
        }>;
      }>;
      clear: (workspaceId: string) => Promise<boolean>;
    };
  }
}
