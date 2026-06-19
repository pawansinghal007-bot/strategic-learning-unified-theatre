import type {
  SecurityOverviewDriftResult,
  SecurityFindingSummary,
  SecurityFindingKind,
  SecuritySeverity,
} from "./schema.js";
import {
  appendDriftHistory,
  type DriftClassification,
  type DriftHistoryEntry,
} from "./drift-history.js";

export interface AutoScanOptions {
  workspaceId?: string;
  repoPath: string;
  imageRef?: string | null;
  baselinePath?: string | null;
  suppressionsPath?: string | null;
  triagePath?: string | null;
  driftHistoryPath?: string | null;
}

export interface AutoScanResult {
  ok: boolean;
  workspaceId?: string;
  secretsResult?: unknown;
  risksDependencyResult?: unknown;
  risksImageResult?: unknown;
  summary?: {
    findings: Record<string, unknown>[];
    snapshot: Record<string, unknown>;
  };
  drift?: SecurityOverviewDriftResult | null;
  driftHistoryAppend?: { filePath: string; count: number } | null;
  error?: string;
}

/**
 * Run secrets + risks scans and build a unified security overview snapshot.
 * Optionally compares with a baseline and appends a drift history entry.
 * All external module imports are lazy (await import) to match repo conventions.
 */
export async function runSecurityAutoScan(
  opts: AutoScanOptions,
): Promise<AutoScanResult> {
  try {
    const {
      workspaceId,
      repoPath,
      imageRef = null,
      baselinePath = null,
      suppressionsPath = null,
      triagePath = null,
      driftHistoryPath = null,
    } = opts;

    const secretsMod = await import("../secrets/index.js");
    const risksMod = await import("../risks/index.js");
    const overviewMod = await import("./index.js");
    const driftMod = await import("./drift.js");
    const triageMod = await import("./triage.js");

    const secretsResult = await secretsMod.runSecretsScan({
      repoPath,
      baselinePath,
      suppressionsPath,
      configPath: null,
      redact: true,
    });

    const risksDependencyResult = await risksMod.runDependencyCheck(
      repoPath,
      {},
    );

    const risksImageResult =
      imageRef != null && imageRef !== ""
        ? await risksMod.runTrivyImage(imageRef)
        : null;

    const secretFindings: Record<string, unknown>[] =
      overviewMod.flattenFindings(secretsResult?.findings ?? [], "secret");

    const riskFindings: Record<string, unknown>[] = [];
    if (risksDependencyResult?.findings) {
      riskFindings.push(
        ...overviewMod.flattenFindings(risksDependencyResult.findings, "risk"),
      );
    }
    if (risksImageResult?.findings) {
      riskFindings.push(
        ...overviewMod.flattenFindings(risksImageResult.findings, "risk"),
      );
    }

    const baseline = overviewMod.loadSecurityBaseline(baselinePath ?? "");
    const suppressions = overviewMod.loadSecuritySuppressions(
      suppressionsPath ?? "",
    );
    const triageEntries = triagePath
      ? triageMod.loadSecurityTriage(triagePath)
      : [];

    const findings: SecurityFindingSummary[] = [
      ...secretFindings,
      ...riskFindings,
    ].map((f) => {
      const suppressed = overviewMod.isSecuritySuppressed(f, suppressions);
      const triageStatus = suppressed
        ? "suppressed"
        : triageMod.getSecurityTriageStatus(
            f.fingerprint as string,
            triageEntries,
          );
      return {
        kind: f.kind as SecurityFindingKind,
        scanner: f.scanner as string,
        id: f.id as string,
        severity: f.severity as SecuritySeverity,
        createdAt: f.createdAt as number,
        suppressed,
        baselineMatched:
          typeof f.fingerprint === "string"
            ? baseline.has(f.fingerprint)
            : false,
        triageStatus: triageStatus,
        title: f.title,
        description: f.description,
        file: f.file,
        package: f.package,
        version: f.version,
        fingerprint: f.fingerprint,
        ruleId: f.ruleId,
        resolvedAt: f.resolvedAt,
      };
    });

    const snapshot = overviewMod.buildSecurityOverviewSnapshot(findings);

    const driftResult: SecurityOverviewDriftResult | null =
      baselinePath === null
        ? null
        : driftMod.compareSecurityOverviewWithBaseline(
            snapshot,
            driftMod.loadSecurityBaselineSnapshot(baselinePath),
          );

    let driftHistoryAppend: AutoScanResult["driftHistoryAppend"] = null;

    if (driftResult && driftHistoryPath) {
      const classification: DriftClassification =
        typeof overviewMod.classifyDriftSeverity === "function"
          ? overviewMod.classifyDriftSeverity({
              introduced: driftResult.introduced,
              resolved: driftResult.resolved,
              persistent: driftResult.persistent,
            })
          : "unknown";

      const entry: DriftHistoryEntry = {
        id: `drift-${Date.now()}`,
        createdAt: Date.now(),
        workspaceId: workspaceId ?? null,
        baselinePath: baselinePath ?? null,
        snapshotPath: null,
        historyPath: driftHistoryPath,
        classification,
        counts: {
          current: driftResult.counts.current,
          baseline: driftResult.counts.baseline,
          introduced: driftResult.counts.introduced,
          persistent: driftResult.counts.persistent,
          resolved: driftResult.counts.resolved,
        },
      };

      driftHistoryAppend = appendDriftHistory(driftHistoryPath, entry);
    }

    return {
      ok: true,
      workspaceId,
      secretsResult,
      risksDependencyResult,
      risksImageResult,
      summary: {
        findings: findings as unknown as Record<string, unknown>[],
        snapshot: snapshot as unknown as Record<string, unknown>,
      },
      drift: driftResult,
      driftHistoryAppend,
    };
  } catch (err) {
    return {
      ok: false,
      error: String((err as Error)?.message ?? err),
    };
  }
}
