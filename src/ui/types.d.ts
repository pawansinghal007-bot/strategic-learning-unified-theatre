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
      set: (
        workspaceId: string,
        policyPatch: Record<string, any>,
        options?: {
          requestedBy?: string;
          reason?: string;
        },
      ) => Promise<any>;
      clear: (workspaceId: string) => Promise<boolean>;
      list: () => Promise<any[]>;
    };
    workspaceApproval: {
      list: (
        workspaceId?: string,
        status?: "pending" | "approved" | "rejected", // was "pending" | "approved" | "rejected"
      ) => Promise<
        Array<{
          id: string;
          workspaceId: string;
          status: "pending" | "approved" | "rejected"; // was "pending" | "approved" | "rejected"
          policyChange: Record<string, unknown>;
          requestedBy: string | null;
          reviewedBy: string | null;
          reason: string | null;
          reviewNote: string | null;
          createdAt: number;
          updatedAt: number;
        }>
      >;
      resolve: (
        approvalId: string,
        status: "approved" | "rejected", // was "approved" | "rejected"
        reviewedBy?: string,
        reviewNote?: string,
      ) => Promise<any>;
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
      list: (
        workspaceId: string,
        limit?: number,
        filter?: {
          startTime?: number;
          endTime?: number;
          provider?: string;
        },
      ) => Promise<any[]>;
      summary: (
        workspaceId: string,
        filter?: {
          startTime?: number;
          endTime?: number;
          provider?: string;
        },
      ) => Promise<{
        workspaceId: string;
        total: number;
        successCount: number;
        failureCount: number;
        successRate: number;
        errorRate: number;
        avgLatencyMs: number;
        latest: number | null;
      }>;
      trends: (
        workspaceId: string,
        filter?: {
          startTime?: number;
          endTime?: number;
          provider?: string;
        },
      ) => Promise<any[]>;
      timeline: (
        workspaceId: string,
        limit?: number,
        filter?: {
          startTime?: number;
          endTime?: number;
          provider?: string;
        },
      ) => Promise<any[]>;
      analytics: (
        workspaceId: string,
        filter?: {
          startTime?: number;
          endTime?: number;
          provider?: string;
        },
      ) => Promise<any>;
      buckets: (
        workspaceId: string,
        bucket: "hour" | "day",
        filter?: {
          startTime?: number;
          endTime?: number;
          provider?: string;
        },
      ) => Promise<any[]>;
      globalAnalytics: (filter?: {
        startTime?: number;
        endTime?: number;
        provider?: string;
      }) => Promise<any[]>;
      providerComparison: (filter?: {
        startTime?: number;
        endTime?: number;
        provider?: string;
      }) => Promise<any[]>;
      bucketChartSvg: (
        workspaceId: string,
        bucket: "hour" | "day",
        filter?: {
          startTime?: number;
          endTime?: number;
          provider?: string;
        },
      ) => Promise<string>;
      providerComparisonChartSvg: (filter?: {
        startTime?: number;
        endTime?: number;
        provider?: string;
      }) => Promise<string>;
      exportJson: (
        workspaceId: string,
        filter?: {
          startTime?: number;
          endTime?: number;
          provider?: string;
        },
      ) => Promise<string>;
      exportCsv: (
        workspaceId: string,
        filter?: {
          startTime?: number;
          endTime?: number;
          provider?: string;
        },
      ) => Promise<string>;
      exportHtmlReport: (
        workspaceId: string,
        filter?: {
          startTime?: number;
          endTime?: number;
          provider?: string;
        },
      ) => Promise<string>;
      clear: (workspaceId: string) => Promise<boolean>;
    };
    workspaceReport: {
      save: (
        workspaceId: string,
        format: "html" | "json" | "csv",
        filter?: {
          startTime?: number;
          endTime?: number;
          provider?: string;
        },
      ) => Promise<{
        canceled: boolean;
        saved: boolean;
        filePath: string | null;
        format: string;
      }>;
    };
    audit: {
      list: (
        limit?: number,
        filter?: {
          action?: string;
          workspaceId?: string;
          targetType?: string;
          startTime?: number;
          endTime?: number;
        },
      ) => Promise<
        Array<{
          id: string;
          seq: number;
          timestamp: number;
          action: string;
          actor: { type: string; id?: string };
          targetType: string;
          targetId: string | null;
          workspaceId: string | null;
          details: Record<string, unknown> | null;
          prevHash: string | null;
          hash: string;
        }>
      >;
      verify: (
        filter?: {
          action?: string;
          workspaceId?: string;
          targetType?: string;
          startTime?: number;
          endTime?: number;
        },
      ) => Promise<{
        ok: boolean;
        checked: number;
        failedAtSeq: number | null;
        expectedHash: string | null;
        actualHash: string | null;
        reason: string | null;
      }>;
      latest: (
        filter?: {
          action?: string;
          workspaceId?: string;
          targetType?: string;
          startTime?: number;
          endTime?: number;
        },
      ) => Promise<any | null>;
      exportJson: (
        filter?: {
          action?: string;
          workspaceId?: string;
          targetType?: string;
          startTime?: number;
          endTime?: number;
        },
      ) => Promise<{
        ok: true;
        format: 'json';
        filePath: string;
        count: number;
        verification: {
          ok: boolean;
          checked: number;
          failedAtSeq: number | null;
          expectedHash: string | null;
          actualHash: string | null;
          reason: string | null;
        };
      }>;
      exportHtmlReport: (
        filter?: {
          action?: string;
          workspaceId?: string;
          targetType?: string;
          startTime?: number;
          endTime?: number;
        },
      ) => Promise<{
        ok: true;
        format: 'html';
        filePath: string;
        count: number;
        verification: {
          ok: boolean;
          checked: number;
          failedAtSeq: number | null;
          expectedHash: string | null;
          actualHash: string | null;
          reason: string | null;
        };
      }>;
    };
  }
}
