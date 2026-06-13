export {};

declare global {
  type SecurityTriageStatus =
    | "open"
    | "suppressed"
    | "accepted"
    | "false_positive"
    | "resolved";

  interface SecurityTriageEntry {
    fingerprint: string;
    status: SecurityTriageStatus;
    reason?: string;
    updatedAt: number;
    updatedBy?: string;
  }

  interface SecuritySummarySnapshot {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
    unknown: number;
    secrets: number;
    risks: number;
    suppressed: number;
    baselineMatched: number;
    open: number;
    accepted: number;
    falsePositive: number;
    resolved: number;
    latestAt: number | null;
  }

  interface SecurityFindingSummary {
    kind: "secret" | "risk";
    scanner: string;
    id: string;
    ruleId?: string;
    title?: string;
    description?: string;
    severity: "critical" | "high" | "medium" | "low" | "info" | "unknown";
    file?: string | null;
    package?: string | null;
    version?: string | null;
    fingerprint?: string;
    suppressed?: boolean;
    baselineMatched?: boolean;
    triageStatus?: SecurityTriageStatus;
    createdAt: number;
    raw?: any;
  }

  interface SeverityCounts {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
    unknown: number;
  }

  interface SecurityOverviewDriftResult {
    ok: true;
    baselineLoaded: boolean;
    counts: {
      current: number;
      baseline: number;
      introduced: number;
      persistent: number;
      resolved: number;
    };
    bySeverity: {
      introduced: SeverityCounts;
      persistent: SeverityCounts;
      resolved: SeverityCounts;
    };
    introduced: Array<Record<string, unknown>>;
    persistent: Array<Record<string, unknown>>;
    resolved: Array<Record<string, unknown>>;
  }

  interface FindingExplanationItem {
    fingerprint: string | null;
    title: string;
    severity: string;
    file: string | null;
    explanation: string;
    recommendation: string;
  }

  interface ExplainIntroducedFindingsResult {
    ok: boolean;
    workspaceId: string | null;
    analyzedCount: number;
    knowledgeUsed: boolean;
    prompt: string;
    answer: string;
    items: FindingExplanationItem[];
    knowledge?: Array<{
      chunkid?: string;
      docid?: string;
      sourcetype?: string;
      sprint?: number;
      featurearea?: string;
      path?: string;
      section?: string;
      importance?: number;
      score?: number;
      text?: string;
    }>;
    error?: string;
  }

  interface RiskFinding {
    id: string;
    scanner: "dependency-check" | "trivy" | "unknown";
    ruleId?: string;
    title?: string;
    description?: string;
    file?: string | null;
    package?: string | null;
    version?: string | null;
    severity: "critical" | "high" | "medium" | "low" | "info" | "unknown";
    fingerprint?: string;
    evidence?: any;
    createdAt: number;
    raw?: any;
  }

  interface Window {
    workspaceRisks: {
      scanDependency: (
        basePath: string,
        options?: {
          baselinePath?: string;
          suppressionsPath?: string;
        },
      ) => Promise<{
        ok: boolean;
        engine: "dependency-check";
        result?: {
          ok: boolean;
          engine: "dependency-check";
          findings: RiskFinding[];
          raw?: unknown;
          error?: string;
        };
        error?: string;
      }>;
      scanImage: (
        imageRef: string,
        options?: Record<string, unknown>,
      ) => Promise<{
        ok: boolean;
        engine: "trivy";
        result?: {
          ok: boolean;
          engine: "trivy";
          findings: RiskFinding[];
          raw?: unknown;
          error?: string;
        };
        error?: string;
      }>;
    };
    workspaceSecurity: {
      summarize: (payload: {
        secrets?: any[];
        risks?: any[];
        baselinePath?: string;
        suppressionsPath?: string;
        triagePath?: string;
      }) => Promise<{
        ok: true;
        findings: SecurityFindingSummary[];
        snapshot: SecuritySummarySnapshot;
      }>;
      saveBaseline: (
        baselinePath: string,
        fingerprints: string[],
      ) => Promise<{ ok: true; filePath: string; count: number }>;
      loadSuppressions: (suppressionsPath: string) => Promise<{
        ok: true;
        suppressions: Array<{
          fingerprint?: string;
          kind?: "secret" | "risk" | "any";
          file?: string;
          ruleId?: string;
          reason?: string;
          createdAt?: number;
        }>;
      }>;
      saveSuppressions: (
        suppressionsPath: string,
        suppressions: Array<{
          fingerprint?: string;
          kind?: "secret" | "risk" | "any";
          file?: string;
          ruleId?: string;
          reason?: string;
        }>,
      ) => Promise<{ ok: true; filePath: string; count: number }>;
      loadTriage: (triagePath: string) => Promise<{
        ok: true;
        entries: SecurityTriageEntry[];
      }>;
      setTriage: (
        triagePath: string,
        fingerprint: string,
        status: SecurityTriageStatus,
        reason?: string,
        updatedBy?: string,
      ) => Promise<{ ok: true; filePath: string; count: number }>;
      setTriageBulk: (
        triagePath: string,
        fingerprints: string[],
        status: SecurityTriageStatus,
        reason?: string,
        updatedBy?: string,
      ) => Promise<{ ok: true; filePath: string; count: number }>;
      compareBaseline: (
        currentSnapshot: any,
        baselinePath?: string | null,
      ) => Promise<SecurityOverviewDriftResult>;
      explainIntroduced: (payload: {
        drift: {
          introduced?: unknown[];
          persistent?: unknown[];
          resolved?: unknown[];
        };
        workspaceId?: string;
        maxFindings?: number;
        model?: string;
        includeKnowledge?: boolean;
        knowledgeQuery?: string;
        minScore?: number;
      }) => Promise<ExplainIntroducedFindingsResult>;
      getDriftClassification(payload: {
        introduced: unknown[];
        resolved: unknown[];
        persistent: unknown[];
      }): Promise<
        | {
            ok: true;
            classification: "clean" | "regressed" | "improved" | "mixed";
          }
        | { ok: false; error: string }
      >;
    };
    secrets: {
      scan: (options: {
        repoPath: string;
        baselinePath?: string | null;
        suppressionsPath?: string | null;
        configPath?: string | null;
        redact?: boolean;
      }) => Promise<{
        ok: true;
        engine: "gitleaks";
        command: string[];
        summary: {
          scannedPath: string;
          findings: number;
          unsuppressed: number;
          suppressed: number;
          baselineMatched: number;
          bySeverity: {
            low: number;
            medium: number;
            high: number;
            critical: number;
          };
          byRule: Record<string, number>;
          completedAt: number;
        };
        findings: Array<{
          id: string;
          ruleId: string;
          description: string;
          severity: "low" | "medium" | "high" | "critical";
          category:
            | "credential"
            | "token"
            | "private_key"
            | "generic"
            | "unknown";
          file: string;
          startLine: number;
          endLine: number;
          startColumn: number;
          endColumn: number;
          commit?: string | null;
          author?: string | null;
          email?: string | null;
          date?: string | null;
          fingerprint: string;
          secretPreview: string | null;
          match: string | null;
          tags: string[];
          baselineMatched: boolean;
          suppressed: boolean;
          suppressionReason: string | null;
        }>;
        raw?: unknown;
      }>;
    };
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
    workspaceKnowledge: {
      ingest: (baseDir?: string, featureArea?: string) => Promise<{ ok: true }>;
      search: (
        queryText: string,
        options?: {
          limit?: number;
          filter?: string;
          minScore?: number;
        },
      ) => Promise<
        Array<{
          chunk_id: string;
          doc_id: string;
          source_type: string;
          sprint: number;
          feature_area: string;
          path: string;
          section: string;
          importance: number;
          score: number;
          text?: string;
        }>
      >;
      buildPromptContext: (
        queryText: string,
        options?: {
          limit?: number;
          filter?: string;
          minScore?: number;
        },
      ) => Promise<
        Array<{
          chunk_id: string;
          doc_id: string;
          source_type: string;
          sprint: number;
          feature_area: string;
          path: string;
          section: string;
          importance: number;
          score: number;
          text?: string;
        }>
      >;
    };
    llm: {
      status: () => Promise<any>;
      setup: (opts: any) => Promise<any>;
      ask: (opts: any) => Promise<{
        answer?: string;
        knowledge?: Array<{
          chunk_id: string;
          doc_id: string;
          source_type: string;
          sprint: number;
          feature_area: string;
          path: string;
          section: string;
          importance: number;
          score: number;
          text?: string;
        }>;
        [key: string]: any;
      }>;
    };
    workspaceQuota: {
      get: (workspaceId: string) => Promise<{
        workspaceId: string;
        dailyLimit: number | null;
        weeklyLimit: number | null;
        mode: "alert" | "fallback" | "block";
        fallbackProvider: string | null;
        alertThresholdPct: number | null;
        createdAt: number;
        updatedAt: number;
      } | null>;
      list: () => Promise<
        Array<{
          workspaceId: string;
          dailyLimit: number | null;
          weeklyLimit: number | null;
          mode: "alert" | "fallback" | "block";
          fallbackProvider: string | null;
          alertThresholdPct: number | null;
          createdAt: number;
          updatedAt: number;
        }>
      >;
      set: (
        workspaceId: string,
        quotaPatch: {
          dailyLimit?: number | null;
          weeklyLimit?: number | null;
          mode?: "alert" | "fallback" | "block";
          fallbackProvider?: string | null;
          alertThresholdPct?: number | null;
        },
        options?: {
          requestedBy?: string;
          reason?: string;
        },
      ) => Promise<{
        workspaceId: string;
        dailyLimit: number | null;
        weeklyLimit: number | null;
        mode: "alert" | "fallback" | "block";
        fallbackProvider: string | null;
        alertThresholdPct: number | null;
        createdAt: number;
        updatedAt: number;
      }>;
      clear: (
        workspaceId: string,
        requestedBy?: string,
      ) => Promise<{ ok: true }>;
      recordUsage: (
        workspaceId: string,
        payload?: { timestamp?: number; provider?: string | null },
      ) => Promise<{
        workspaceId: string;
        dayCount: number;
        weekCount: number;
        dailyLimit: number | null;
        weeklyLimit: number | null;
        exceededDaily: boolean;
        exceededWeekly: boolean;
        exceeded: boolean;
        thresholdReachedDaily: boolean;
        thresholdReachedWeekly: boolean;
        thresholdReached: boolean;
        mode: "alert" | "fallback" | "block" | null;
        fallbackProvider: string | null;
        alertThresholdPct: number | null;
      }>;
      usage: (
        workspaceId: string,
        now?: number,
      ) => Promise<{
        workspaceId: string;
        dayCount: number;
        weekCount: number;
        dailyLimit: number | null;
        weeklyLimit: number | null;
        exceededDaily: boolean;
        exceededWeekly: boolean;
        exceeded: boolean;
        thresholdReachedDaily: boolean;
        thresholdReachedWeekly: boolean;
        thresholdReached: boolean;
        mode: "alert" | "fallback" | "block" | null;
        fallbackProvider: string | null;
        alertThresholdPct: number | null;
      }>;
      evaluate: (
        workspaceId: string,
        now?: number,
      ) => Promise<{
        allowed: boolean;
        shouldFallback: boolean;
        shouldAlert: boolean;
        blocked: boolean;
        thresholdReached: boolean;
        fallbackProvider: string | null;
        usage: {
          workspaceId: string;
          dayCount: number;
          weekCount: number;
          dailyLimit: number | null;
          weeklyLimit: number | null;
          exceededDaily: boolean;
          exceededWeekly: boolean;
          exceeded: boolean;
          thresholdReachedDaily: boolean;
          thresholdReachedWeekly: boolean;
          thresholdReached: boolean;
          mode: "alert" | "fallback" | "block" | null;
          fallbackProvider: string | null;
          alertThresholdPct: number | null;
        };
      }>;
      clearUsage: (workspaceId?: string) => Promise<{ ok: true }>;
      rollup: (now?: number) => Promise<
        Array<{
          workspaceId: string;
          mode: "alert" | "fallback" | "block";
          fallbackProvider: string | null;
          dailyLimit: number | null;
          weeklyLimit: number | null;
          alertThresholdPct: number | null;
          dayCount: number;
          weekCount: number;
          thresholdReached: boolean;
          exceeded: boolean;
        }>
      >;
      latestNotification: (workspaceId?: string) => Promise<{
        workspaceId: string;
        type: "threshold" | "exceeded" | "dailyReset";
        timestamp: number;
        dayCount: number;
        weekCount: number;
        source: "usage" | "scheduler" | "manual";
      } | null>;
      notifications: (workspaceId?: string) => Promise<
        Array<{
          workspaceId: string;
          type: "threshold" | "exceeded" | "dailyReset";
          timestamp: number;
          dayCount: number;
          weekCount: number;
          source: "usage" | "scheduler" | "manual";
        }>
      >;
      resetDaily: (now?: number) => Promise<{
        ok: true;
        resetAt: number;
        prunedCount: number;
      }>;
      onNotification: (
        handler: (payload: {
          workspaceId: string;
          type: "threshold" | "exceeded" | "dailyReset";
          timestamp: number;
          dayCount: number;
          weekCount: number;
          source: "usage" | "scheduler" | "manual";
        }) => void,
      ) => () => void;
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
      verify: (filter?: {
        action?: string;
        workspaceId?: string;
        targetType?: string;
        startTime?: number;
        endTime?: number;
      }) => Promise<{
        ok: boolean;
        checked: number;
        failedAtSeq: number | null;
        expectedHash: string | null;
        actualHash: string | null;
        reason: string | null;
      }>;
      latest: (filter?: {
        action?: string;
        workspaceId?: string;
        targetType?: string;
        startTime?: number;
        endTime?: number;
      }) => Promise<any | null>;
      exportJson: (filter?: {
        action?: string;
        workspaceId?: string;
        targetType?: string;
        startTime?: number;
        endTime?: number;
      }) => Promise<{
        ok: true;
        format: "json";
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
      exportHtmlReport: (filter?: {
        action?: string;
        workspaceId?: string;
        targetType?: string;
        startTime?: number;
        endTime?: number;
      }) => Promise<{
        ok: true;
        format: "html";
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
