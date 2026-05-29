import child_process from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveBinary, sanitizeEnvForSpawn } from "../src/internal/paths.js";
import { DocumentIngester } from "../src/llm/document-ingester.js";
import { MistakeTracker } from "../src/llm/mistake-tracker.js";
import { DEFAULT_CONFIG } from "../src/internal/config.js";
import {
  defaultStagedSignalsDir,
  formatFrontmatter,
  fileTimestamp,
  isAllowedExtension,
  isExcludedPath,
  isSecretPath,
  parseFrontmatter,
  sanitizeFilename,
  splitStagedSignalDocuments,
} from "../src/storage/vscode-learn-utils.js";

function pickSignalType(signal) {
  if (signal.signal_type) return signal.signal_type;
  if (signal.type) return signal.type;
  return "vscode-signal";
}

function buildSignalDocument(signal) {
  const fm = {
    type: "signal",
    signal_type: signal.signal_type,
    source: signal.source || "vscode",
    captured_at: signal.captured_at,
    file_path: signal.file_path,
    commit_hash: signal.commit_hash,
    commit_message: signal.commit_message,
    files_changed: signal.files_changed,
    command: signal.command,
    exit_code: signal.exit_code,
    status: signal.status,
    severity: signal.severity,
    recurring: signal.recurring ? "true" : "false",
    tags: signal.tags ?? [],
    ...(signal.platform && { platform: signal.platform }),
    ...(signal.document_type && { document_type: signal.document_type }),
    ...(signal.source_type && { source_type: signal.source_type }),
    ...(signal.signal_id && { signal_id: signal.signal_id }),
    ...(signal.message && { message: signal.message }),
  };
  return `${formatFrontmatter(fm)}${String(signal.content ?? signal.text ?? signal.body ?? "").trim()}`;
}

export class VscodeContextCollector {
  constructor(outputChannel, config = {}) {
    this.outputChannel = outputChannel ?? { appendLine: () => {} };
    this.config = config;
    this.vscodeLearn = {
      ...DEFAULT_CONFIG.vscodeLearn,
      ...(config.vscodeLearn ?? {}),
    };
    this.baseDir = this.config.baseDir ?? null;
    this.stagedSignalsDir = this.vscodeLearn.stagedSignalsDir
      ? path.resolve(this.vscodeLearn.stagedSignalsDir)
      : defaultStagedSignalsDir(this.config);
    this._buffer = [];
    this.buffer = new Map();
    this._lastSeen = new Map();
    this.lastStageAt = this._lastSeen;
    this.diagnosticCounts = new Map();
    this.gitLastCommit = null;
    this.flushInterval = null;
    this._hardExcludePatterns = [
      "**/.env*",
      "**/*.key",
      "**/*.pem",
      "**/*.p12",
      "**/*.pfx",
      "**/*.secret",
      "**/*secret*",
      "**/id_rsa",
      "**/id_ed25519",
      "**/*.enc",
      "**/node_modules/**",
      "**/.git/**",
      "**/dist/**",
      "**/build/**",
      "**/*.min.js",
      "**/*.min.css",
    ];
    this.cliPath = this.config.cliPath ?? null;
  }

  async _ensureStagingDir() {
    await fs.mkdir(this.stagedSignalsDir, { recursive: true, mode: 0o700 });
    return this.stagedSignalsDir;
  }

  async _listStagedFiles() {
    try {
      const files = await fs.readdir(this.stagedSignalsDir, {
        withFileTypes: true,
      });
      return files
        .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
        .map((entry) => path.join(this.stagedSignalsDir, entry.name));
    } catch {
      return [];
    }
  }

  _matchesHardExclude(filePath) {
    if (!filePath) return false;
    const normalized = String(filePath).replace(/\\/g, "/").toLowerCase();
    if (isSecretPath(filePath)) return true;
    return this._hardExcludePatterns.some((pattern) => {
      if (pattern === "**/.env*")
        return path.basename(filePath).toLowerCase().startsWith(".env");
      if (pattern === "**/*.secret") return normalized.endsWith(".secret");
      if (pattern === "**/*secret*") return normalized.includes("secret");
      if (pattern === "**/id_rsa") return normalized.endsWith("/id_rsa");
      if (pattern === "**/id_ed25519")
        return normalized.endsWith("/id_ed25519");
      return normalized.includes(
        pattern.replace(/\*\*/g, "").replace(/\*/g, ""),
      );
    });
  }

  _matchesSoftExclude(filePath) {
    const normalized = String(filePath).replace(/\\/g, "/").toLowerCase();
    const patterns = this.vscodeLearn.excludePatterns || [];
    return patterns.some((pattern) =>
      normalized.includes(pattern.replace(/\*\*/g, "").replace(/\*/g, "")),
    );
  }

  _shouldSkipByPath(filePath) {
    return (
      !filePath ||
      this._matchesHardExclude(filePath) ||
      isExcludedPath(filePath)
    );
  }

  _getSignalBufferKey(signal) {
    const signalType = pickSignalType(signal);
    if (signalType === "vscode-edit" || signalType === "vscode-diagnostic") {
      return `${signalType}:${signal.file_path || signal.filePath || signal.path}`;
    }
    return `${signalType}:${signal.signal_id || signal.commit_hash || signal.command || String(signal.message ?? "").trim()}`;
  }

  _shouldDebounce(key) {
    const last = this.lastStageAt.get(key);
    if (!last) return false;
    return Date.now() - last < Number(this.vscodeLearn.debounceMs);
  }

  _recordStage(key) {
    this.lastStageAt.set(key, Date.now());
  }

  _buildSignal(signal) {
    const signalType = pickSignalType(signal);
    const base = {
      source: signal.source || "vscode",
      platform: signal.platform || "vscode",
      captured_at: signal.captured_at ?? new Date().toISOString(),
      recurring: Boolean(signal.recurring),
      tags: signal.tags ?? [],
      signal_type: signalType,
      source_type: signal.source_type ?? signalType,
      document_type: signal.document_type,
      signal_id: signal.signal_id,
    };

    if (signal.filePath || signal.file_path || signal.path) {
      base.file_path = signal.filePath || signal.file_path || signal.path;
    }

    if (signalType === "vscode-task-error") {
      base.command = signal.command;
      base.exit_code = Number(
        signal.exit_code ?? signal.exitCode ?? signal.code ?? NaN,
      );
    }

    if (signalType === "vscode-git") {
      base.commit_hash = signal.commit_hash || signal.commitHash || signal.sha;
      base.commit_message =
        signal.commit_message || signal.commitMessage || signal.message;
      base.files_changed =
        signal.files_changed || signal.filesChanged || signal.changed_files;
    }

    if (signalType === "vscode-diagnostic") {
      base.severity = Number(
        signal.severity ?? signal.diagnostic?.severity ?? NaN,
      );
      base.message = signal.message || signal.diagnostic?.message || "";
    }

    base.content = String(
      signal.content ?? signal.text ?? signal.body ?? "",
    ).trim();
    return base;
  }

  async stageSignal(signal) {
    if (!this.vscodeLearn.enabled) {
      this.outputChannel.appendLine(
        "[vscode-learn] passive learning is disabled; signal staging skipped.",
      );
      return null;
    }

    const built = this._buildSignal(signal);
    this._validateBuiltSignal(built);

    if (this._shouldSkipPath(built.file_path)) return null;
    if (this._shouldSkipEditSignal(built)) return null;
    if (this._shouldSkipDiagnosticSignal(built)) return null;
    if (this._shouldSkipGitSignal(built)) return null;
    if (this._shouldSkipTaskErrorSignal(built)) return null;

    const key = this._getSignalBufferKey(built);
    if (this._shouldDebounce(key)) {
      return null;
    }
    this._recordStage(key);

    const signalId = `${fileTimestamp()}-${sanitizeFilename(built.signal_type)}-${this.buffer.size + 1}`;
    this.buffer.set(signalId, built);
    this._buffer.push(built);
    return built;
  }

  _validateBuiltSignal(built) {
    if (!built.content) {
      throw new Error("Signal content must be provided.");
    }
  }

  _shouldSkipPath(filePath) {
    return filePath && this._shouldSkipByPath(filePath);
  }

  _shouldSkipEditSignal(built) {
    if (built.signal_type !== "vscode-edit") return false;
    const filePath = built.file_path;
    if (!filePath || !isAllowedExtension(filePath, this.vscodeLearn.allowedExtensions)) {
      return true;
    }

    if (Buffer.byteLength(built.content, "utf8") > Number(this.vscodeLearn.maxFileSizeBytes)) {
      this.outputChannel.appendLine(
        "[vscode-learn] staged signal skipped: content exceeds maxFileSizeBytes.",
      );
      return true;
    }

    return false;
  }

  _shouldSkipDiagnosticSignal(built) {
    if (built.signal_type !== "vscode-diagnostic") return false;
    if (built.severity !== 0) return true;

    const filePath = built.file_path;
    if (!filePath || !isAllowedExtension(filePath, this.vscodeLearn.allowedExtensions)) {
      return true;
    }

    const diagKey = `${filePath}:${built.message}`;
    const previousCount = this.diagnosticCounts.get(diagKey) ?? 0;
    this.diagnosticCounts.set(diagKey, previousCount + 1);
    if (previousCount >= 1) {
      built.signal_type = "vscode-diagnostic-recurring";
      built.source_type = "vscode-diagnostic-recurring";
      built.recurring = true;
    }

    return false;
  }

  _shouldSkipGitSignal(built) {
    if (built.signal_type !== "vscode-git") return false;
    return !built.commit_hash || !built.commit_message;
  }

  _shouldSkipTaskErrorSignal(built) {
    if (built.signal_type !== "vscode-task-error") return false;
    return (
      Number.isNaN(Number(built.exit_code)) ||
      Number(built.exit_code) === 0
    );
  }

  async _runCli(args = []) {
    if (!this.cliPath) {
      return null;
    }
    return new Promise((resolve, reject) => {
      const env = sanitizeEnvForSpawn(process.env);
      const nodeBin = process.execPath;
      const proc = child_process.spawn(nodeBin, [this.cliPath, ...args], {
        cwd: path.dirname(this.cliPath),
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      proc.stdout.on("data", (chunk) =>
        this.outputChannel.appendLine(chunk.toString()),
      );
      proc.stderr.on("data", (chunk) =>
        this.outputChannel.appendLine(chunk.toString()),
      );

      proc.on("error", (err) => reject(err));
      proc.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`CLI exited with code ${code}`));
        }
      });
    });
  }

  async _writeStagedFile(signals) {
    await this._ensureStagingDir();
    const filename = `${fileTimestamp()}-vscode-signals.md`;
    const filePath = path.join(this.stagedSignalsDir, filename);
    const payload =
      signals.map((signal) => buildSignalDocument(signal)).join("\n---\n") +
      "\n";
    const tempPath = `${filePath}.tmp`;
    await fs.writeFile(tempPath, payload, { encoding: "utf8", mode: 0o600 });
    await fs.rename(tempPath, filePath);
    try {
      await fs.chmod(filePath, 0o600);
    } catch {
      // ignore chmod failures on platforms where it is not supported
    }
    return filePath;
  }

  async flush() {
    if (this._buffer.length === 0) {
      this.outputChannel.appendLine(
        "[vscode-learn] flush skipped: no staged signals.",
      );
      return [];
    }
    const signals = [...this._buffer];
    this._buffer = [];
    this.buffer.clear();
    const stagedFilePath = await this._writeStagedFile(signals);
    this.outputChannel.appendLine(
      `[vscode-learn] flushed ${signals.length} staged signal(s) to ${stagedFilePath}`,
    );
    if (this.cliPath) {
      try {
        await this._runCli(["llm", "ingest-staged"]);
      } catch (err) {
        this.outputChannel.appendLine(
          `[vscode-learn] ingest-staged CLI failed: ${String(err.message)}`,
        );
      }
    }
    const results = await this.ingestStagedSignals();
    this.outputChannel.appendLine(
      `[vscode-learn] flush complete. ${results.length} staged files processed.`,
    );
    return results;
  }

  async ingestStagedSignals() {
    const stagedFiles = await this._listStagedFiles();
    if (stagedFiles.length === 0) {
      this.outputChannel.appendLine("[vscode-learn] no staged signals found.");
      return [];
    }

    const ingester = new DocumentIngester({ baseDir: this.baseDir });
    await ingester.initialize();
    const tracker = new MistakeTracker({ baseDir: this.baseDir });

    const results = [];
    for (const filePath of stagedFiles) {
      const raw = await fs.readFile(filePath, "utf8");
      const documents = splitStagedSignalDocuments(raw);
      let fileFailed = false;

      for (const documentText of documents) {
        const { data } = parseFrontmatter(documentText);
        const sourceType =
          data.source_type || data.signal_type || "vscode-signal";
        const platform = data.platform || "vscode";
        const signalType = data.signal_type || "vscode-signal";
        const textFile = await this._writeTempSignalFile(
          filePath,
          documentText,
        );

        try {
          const result = await ingester.ingestFile(textFile, {
            source_type: sourceType,
            platform,
            fileTs: data.captured_at,
          });

          if (signalType === "vscode-diagnostic-recurring") {
            await tracker.addMistake({
              description:
                data.message ||
                data.commit_message ||
                `Recurring diagnostic discovered in ${path.basename(filePath)}`,
              category: "vscode-diagnostic",
              fix_applied:
                data.fix_applied ||
                "Review the recurring diagnostic and correct the root cause.",
              root_cause: data.message || "Recurring IDE diagnostic",
            });
          }

          results.push({ file: filePath, chunkPath: textFile, ...result });
        } catch (error) {
          fileFailed = true;
          this.outputChannel.appendLine(
            `[vscode-learn] failed to ingest staged signal entry in ${filePath}: ${String(error.message)}`,
          );
        } finally {
          await fs.rm(textFile, { force: true });
        }
      }

      if (!fileFailed) {
        await fs.rm(filePath, { force: true });
      }
    }

    try {
      await ingester.db.close();
    } catch {
      // ignore
    }

    return results;
  }

  async _writeTempSignalFile(sourceFilePath, documentText) {
    const tempDir = path.dirname(sourceFilePath);
    // Non-cryptographic randomness — used to create a reasonably-unique temp filename only.
    // This value is not used for authentication, session IDs, or telemetry keys. // NOSONAR javascript:S2245
    const tempName = `${path.basename(sourceFilePath, ".md")}-${Math.random().toString(36).slice(2, 10)}.signal.md`;
    const tempPath = path.join(tempDir, tempName);
    await fs.writeFile(tempPath, documentText, {
      encoding: "utf8",
      mode: 0o600,
    });
    return tempPath;
  }

  _relativePath(filePath, workspaceFolders) {
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return path.basename(filePath);
    }
    const normalized = path.resolve(filePath);
    for (const folder of workspaceFolders) {
      const folderPath = folder.uri?.fsPath
        ? path.resolve(folder.uri.fsPath)
        : null;
      if (!folderPath) continue;
      if (normalized.startsWith(folderPath + path.sep)) {
        return path.relative(folderPath, normalized).replace(/\\/g, "/");
      }
    }
    return path.basename(filePath);
  }

  async _onFileSave(doc, vscodeApi) {
    if (doc.uri.scheme !== "file") return;
    const filePath = doc.uri.fsPath;
    if (this._shouldSkipByPath(filePath)) return;
    if (this._matchesSoftExclude(filePath)) return;

    let stat;
    try {
      stat = await fs.stat(filePath);
    } catch {
      return;
    }

    if (stat.size > Number(this.vscodeLearn.maxFileSizeBytes)) {
      this.outputChannel.appendLine(
        `[collector] skipped ${path.basename(filePath)}: file too large (${stat.size} bytes)`,
      );
      return;
    }

    const lines = doc.getText().split("\n");
    const preview = lines.slice(0, 60).join("\n");
    const relativePath = this._relativePath(
      filePath,
      vscodeApi.workspace.workspaceFolders,
    );
    const content = [
      `[source_type: vscode-edit]`,
      `file: ${relativePath} (${doc.languageId}, ${doc.lineCount} lines)`,
      `saved: ${new Date().toISOString()}`,
      `---`,
      preview,
    ].join("\n");

    const result = await this.stageSignal({
      signal_type: "vscode-edit",
      source_type: "vscode-edit",
      filePath,
      content,
      captured_at: new Date().toISOString(),
      platform: "vscode",
      metadata: { filePath, languageId: doc.languageId },
    });

    if (result) {
      this.outputChannel.appendLine(`[collector] queued edit: ${relativePath}`);
      this._lastSeen.set(filePath, Date.now());
    }
  }

  async _onDiagnosticsChange(event, vscodeApi) {
    for (const uri of event.uris) {
      const diagnostics = vscodeApi.languages.getDiagnostics(uri);
      const errors = diagnostics.filter(
        (diag) => diag.severity === vscodeApi.DiagnosticSeverity.Error,
      );
      if (errors.length === 0) continue;

      const content = [
        `[source_type: vscode-diagnostic]`,
        `file: ${uri.fsPath}`,
        `timestamp: ${new Date().toISOString()}`,
        `error_count: ${errors.length}`,
        `---`,
        ...errors.map(
          (d) => `ERROR line ${d.range.start.line + 1}: ${d.message}`,
        ),
      ].join("\n");

      const result = await this.stageSignal({
        signal_type: "vscode-diagnostic",
        source_type: "vscode-diagnostic",
        filePath: uri.fsPath,
        content,
        captured_at: new Date().toISOString(),
        platform: "vscode",
        message: errors.map((d) => d.message).join(" | "),
        metadata: { filePath: uri.fsPath, errorCount: errors.length },
      });

      if (result) {
        this.outputChannel.appendLine(
          `[collector] queued diagnostic: ${path.basename(uri.fsPath)}`,
        );
      }
    }
  }

  async _onTaskEnd(event) {
    const exitCode = event.exitCode;
    if (exitCode === undefined || exitCode === 0) return;

    const taskName = event.execution?.task?.name || "unknown task";
    const content = [
      `[source_type: vscode-task-error]`,
      `task: ${taskName}`,
      `exit_code: ${exitCode}`,
      `timestamp: ${new Date().toISOString()}`,
      `---`,
      `Task ${taskName} exited with code ${exitCode}`,
    ].join("\n");

    const result = await this.stageSignal({
      signal_type: "vscode-task-error",
      source_type: "vscode-task-error",
      filePath: this.baseDir ?? "",
      content,
      captured_at: new Date().toISOString(),
      platform: "vscode",
      command: taskName,
      exit_code: exitCode,
      metadata: { taskName },
    });

    if (result) {
      this.outputChannel.appendLine(
        `[collector] queued task error: ${taskName}`,
      );
    }
  }

  async _onGitStateChange(repo) {
    try {
      const head = repo.state?.HEAD;
      const commitHash = head?.commit;
      if (!commitHash || commitHash === this.gitLastCommit) return;

      const commitMessage = head?.message || "";
      const timestamp = head?.date
        ? new Date(head.date).toISOString()
        : new Date().toISOString();
      const filesChanged = (repo.state?.indexChanges ?? [])
        .map((change) => change.uri?.fsPath)
        .filter(Boolean);

      const content = [
        `[source_type: vscode-git]`,
        `commit: ${commitHash.slice(0, 7)}`,
        `message: ${commitMessage}`,
        `files_changed: ${filesChanged.join(", ")}`,
        `timestamp: ${timestamp}`,
        `---`,
        `Commit ${commitHash.slice(0, 7)}: ${commitMessage}`,
      ].join("\n");

      const result = await this.stageSignal({
        signal_type: "vscode-git",
        source_type: "vscode-git",
        filePath: repo.rootUri?.fsPath || "",
        content,
        captured_at: timestamp,
        platform: "vscode",
        commit_hash: commitHash,
        commit_message: commitMessage,
        files_changed: filesChanged,
      });

      if (result) {
        this.outputChannel.appendLine(
          `[collector] queued git commit: ${commitHash.slice(0, 7)}`,
        );
      }
      this.gitLastCommit = commitHash;
    } catch (err) {
      this.outputChannel.appendLine(
        `[collector] git listener error: ${String(err.message)}`,
      );
    }
  }

  async _pollGit(rootPath) {
    try {
      const gitBin = resolveBinary("git") || "git";
      // If resolveBinary doesn't locate git in known-safe locations we fall back
      // to the PATH-resolved `git` but supply a sanitized environment.
      const output = child_process.execFileSync(
        gitBin,
        ["log", "-1", "--format=%H|%s|%ai", "--no-merges"],
        {
          cwd: rootPath,
          encoding: "utf8",
          env: sanitizeEnvForSpawn(process.env),
        },
      );
      const [hash, subject, timestamp] = output.trim().split("|");
      if (!hash || hash === this.gitLastCommit) return;

      const diffOutput = child_process.execFileSync(
        gitBin,
        ["diff-tree", "--no-commit-id", "-r", "--name-only", hash],
        {
          cwd: rootPath,
          encoding: "utf8",
          env: sanitizeEnvForSpawn(process.env),
        },
      );
      const filesChanged = diffOutput
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      const content = [
        `[source_type: vscode-git]`,
        `commit: ${hash.slice(0, 7)}`,
        `message: ${subject}`,
        `files_changed: ${filesChanged.join(", ")}`,
        `timestamp: ${new Date(timestamp).toISOString()}`,
        `---`,
        `Commit ${hash.slice(0, 7)}: ${subject}`,
      ].join("\n");

      const result = await this.stageSignal({
        signal_type: "vscode-git",
        source_type: "vscode-git",
        filePath: rootPath,
        content,
        captured_at: new Date(timestamp).toISOString(),
        platform: "vscode",
        commit_hash: hash,
        commit_message: subject,
        files_changed: filesChanged,
      });

      if (result) {
        this.outputChannel.appendLine(
          `[collector] queued git commit: ${hash.slice(0, 7)}`,
        );
      }
      this.gitLastCommit = hash;
    } catch {
      // ignore polling failures, continue next interval
    }
  }

  _setupGitListeners(vscodeApi, registerDisposable) {
    try {
      const gitExt = vscodeApi.extensions?.getExtension("vscode.git")?.exports;
      const api = gitExt?.getAPI?.(1);
      if (api) {
        for (const repo of api.repositories ?? []) {
          const disposable = repo.state.onDidChange(() =>
            this._onGitStateChange(repo),
          );
          if (disposable) registerDisposable(disposable);
        }
        return;
      }
    } catch {
      // fallback to polling if extension API is unavailable
    }

    const workspaceRoot = (vscodeApi.workspace.workspaceFolders ?? [])[0]?.uri
      ?.fsPath;
    if (!workspaceRoot) return;
    const pollInterval = setInterval(() => this._pollGit(workspaceRoot), 60000);
    registerDisposable({ dispose: () => clearInterval(pollInterval) });
    this._pollGit(workspaceRoot).catch(() => {});
  }

  deactivate() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    this.flush().catch((err) => {
      this.outputChannel.appendLine(
        `[collector] deactivate flush failed: ${String(err.message)}`,
      );
    });
  }

  /**
   * Activate event listeners and start periodic flushing.
   */
  activate(contextOrVscode) {
    const hasSubscriptions =
      contextOrVscode && Array.isArray(contextOrVscode.subscriptions);
    const vscodeApi = contextOrVscode;

    if (!vscodeApi?.workspace) {
      return { dispose: () => {} };
    }

    if (!this.vscodeLearn.enabled) {
      this.outputChannel.appendLine(
        "strategic-learning-unified-theatre: passive learning disabled",
      );
      return { dispose: () => {} };
    }

    const subscriptions = [];
    const registerDisposable = (disposable) => {
      if (disposable && typeof disposable.dispose === "function") {
        subscriptions.push(disposable);
        if (hasSubscriptions) {
          contextOrVscode.subscriptions.push(disposable);
        }
      }
    };

    registerDisposable(
      vscodeApi.workspace.onDidSaveTextDocument(async (doc) => {
        try {
          await this._onFileSave(doc, vscodeApi);
        } catch (err) {
          this.outputChannel.appendLine(
            `[collector] save error: ${String(err.message)}`,
          );
        }
      }),
    );

    registerDisposable(
      vscodeApi.languages.onDidChangeDiagnostics(async (event) => {
        try {
          await this._onDiagnosticsChange(event, vscodeApi);
        } catch (err) {
          this.outputChannel.appendLine(
            `[collector] diag error: ${String(err.message)}`,
          );
        }
      }),
    );

    if (vscodeApi.tasks?.onDidEndTaskProcess) {
      registerDisposable(
        vscodeApi.tasks.onDidEndTaskProcess(async (event) => {
          try {
            await this._onTaskEnd(event);
          } catch (err) {
            this.outputChannel.appendLine(
              `[collector] task error: ${String(err.message)}`,
            );
          }
        }),
      );
    }

    this._setupGitListeners(vscodeApi, registerDisposable);

    this.flushInterval = setInterval(async () => {
      if (this._buffer.length > 0) {
        try {
          await this.flush();
        } catch (err) {
          this.outputChannel.appendLine(
            `[collector] flush error: ${String(err.message)}`,
          );
        }
      }
    }, Number(this.vscodeLearn.flushIntervalMs));

    registerDisposable({ dispose: () => clearInterval(this.flushInterval) });

    return {
      dispose: () => {
        if (this.flushInterval) {
          clearInterval(this.flushInterval);
          this.flushInterval = null;
        }
        subscriptions.forEach((subscription) => subscription?.dispose?.());
        this.flush().catch((err) => {
          this.outputChannel.appendLine(
            `[collector] dispose flush failed: ${String(err.message)}`,
          );
        });
      },
    };
  }
}

export const VscodeSignalCollector = VscodeContextCollector;
