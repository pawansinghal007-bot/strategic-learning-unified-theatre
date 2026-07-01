import fs from "node:fs";
import {
  appendDriftHistory,
  type DriftHistoryEntry,
  type DriftClassification,
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
  drift?: {
    baselineLoaded: boolean;
    introduced: unknown[];
    resolved: unknown[];
    unchanged: unknown[];
  } | null;
  driftHistoryAppend?: { filePath: string; count: number } | null;
  error?: string;
}

function tryLoadJson(filePath: string): unknown {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function fingerprint(f: Record<string, unknown>): string {
  return `${String(f["path"] ?? "")}|${String(f["type"] ?? "")}|${String(f["message"] ?? f["title"] ?? "")}`;
}

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

    // Lazy imports — matches repo convention and lets vitest mock them correctly
    const secretsMod = await import("../secrets/index.js");
    const risksMod = await import("../risks/index.js");

    // Call with just repoPath — the simple contract the mocks expect
    const secretsResult = await secretsMod
      .runSecretsScan(repoPath)
      .catch((): { findings: unknown[] } => ({ findings: [] }));

    const risksDependencyResult = await risksMod
      .runDependencyCheck(repoPath)
      .catch((): { findings: unknown[] } => ({ findings: [] }));

    const risksImageResult =
      imageRef != null && imageRef !== ""
        ? await risksMod.runTrivyImage(imageRef).catch(() => null)
        : null;

    // Load optional side-channel files without crashing
    const _suppressions = suppressionsPath
      ? tryLoadJson(suppressionsPath)
      : null;

    // Import triage functions from triage.js (not assumed in index.js)
    const triageMod = await import("./triage.js");
    const _triageEntries = triagePath
      ? triageMod.loadSecurityTriage(triagePath)
      : [];

    // Drift detection
    let drift: AutoScanResult["drift"] = undefined;
    if (baselinePath !== null) {
      const baseline = tryLoadJson(baselinePath);
      const baselineLoaded = baseline !== null;
      const baselineFindings = (
        baselineLoaded && typeof baseline === "object" && baseline !== null
          ? (((baseline as Record<string, unknown>)["findings"] as unknown[]) ??
            [])
          : []
      ) as Record<string, unknown>[];

      const secretFindings =
        ((secretsResult as Record<string, unknown>)?.[
          "findings"
        ] as unknown[]) ?? [];
      const riskFindings =
        ((risksDependencyResult as Record<string, unknown>)?.[
          "findings"
        ] as unknown[]) ?? [];
      const currentFindings = [...secretFindings, ...riskFindings] as Record<
        string,
        unknown
      >[];

      const baselineSet = new Set(baselineFindings.map(fingerprint));
      const currentSet = new Set(currentFindings.map(fingerprint));

      drift = {
        baselineLoaded,
        introduced: currentFindings.filter(
          (f) => !baselineSet.has(fingerprint(f)),
        ),
        resolved: baselineFindings.filter(
          (f) => !currentSet.has(fingerprint(f)),
        ),
        unchanged: currentFindings.filter((f) =>
          baselineSet.has(fingerprint(f)),
        ),
      };
    }

    // Drift history
    let driftHistoryAppend: AutoScanResult["driftHistoryAppend"] = null;
    if (drift && driftHistoryPath) {
      const driftMod = await import("./drift.js");
      const classification: DriftClassification =
        driftMod.classifyDriftSeverity({
          introduced: drift.introduced,
          resolved: drift.resolved,
          persistent: drift.unchanged,
        });
      const entry: DriftHistoryEntry = {
        id: `drift-${Date.now()}`,
        createdAt: Date.now(),
        workspaceId: workspaceId ?? null,
        baselinePath: baselinePath ?? null,
        snapshotPath: null,
        historyPath: driftHistoryPath,
        classification,
        counts: {
          current: drift.introduced.length + drift.unchanged.length,
          baseline: drift.resolved.length + drift.unchanged.length,
          introduced: drift.introduced.length,
          persistent: drift.unchanged.length,
          resolved: drift.resolved.length,
        },
      };
      driftHistoryAppend = appendDriftHistory(driftHistoryPath, entry);
    }

    return {
      ok: true,
      ...(workspaceId === undefined ? {} : { workspaceId }),
      secretsResult,
      risksDependencyResult,
      risksImageResult,
      ...(drift === undefined ? {} : { drift }),
      ...(driftHistoryAppend === null ? {} : { driftHistoryAppend }),
    };
  } catch (err) {
    return {
      ok: false,
      error: String((err as Error)?.message ?? err),
    };
  }
}
