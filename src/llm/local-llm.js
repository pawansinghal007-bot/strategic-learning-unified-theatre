import crypto from "node:crypto";
import fs from "node:fs/promises";
import nodefs from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig, assertFeatureEnabled } from "../internal/config.js";
import { listSprints } from "../agent-handoff.js";
import { DocumentIngester } from "./document-ingester.js";
import { ExperienceDb } from "./experience-db.js";
import {
  LocalLlmInference,
  resolvePreferredLlmProvider,
  installOllamaModel,
  isOllamaAvailable,
  listOllamaModels,
  verifyLocalLlmRuntime,
} from "./inference.js";
import { MistakeTracker } from "./mistake-tracker.js";
import { PromptGenerator } from "./prompt-generator.js";
import { createLogger } from "../logger.js";

const log = createLogger("local-llm");

export const MODEL_REGISTRY = {
  phi3: {
    name: "Phi-3-mini-4k-instruct-q4.gguf",
    url: "https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf/resolve/main/Phi-3-mini-4k-instruct-q4.gguf",
    sha256: null,
  },
  tinyllama: {
    name: "tinyllama-1.1b-q3_k_s.gguf",
    url: "https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q3_K_S.gguf",
    sha256: null,
  },
};

export const OLLAMA_MODEL_REGISTRY = {
  phi3: "phi3:mini",
  tinyllama: "tinyllama",
};

export function llmBaseDir(baseDir) {
  return baseDir ?? path.join(os.homedir(), ".vscode-rotator");
}

function modelDir(baseDir) {
  return path.join(llmBaseDir(baseDir), "models");
}

async function sha256(filePath) {
  const hash = crypto.createHash("sha256");
  const handle = await fs.open(filePath, "r");
  try {
    for await (const chunk of handle.createReadStream()) hash.update(chunk);
  } finally {
    await handle.close();
  }
  return hash.digest("hex");
}

function download(url, target) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      if (
        [301, 302, 303, 307, 308].includes(response.statusCode) &&
        response.headers.location
      ) {
        response.resume();
        download(response.headers.location, target).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Download failed with HTTP ${response.statusCode}`));
        return;
      }
      const output = nodefs.createWriteStream(target, { mode: 0o600 });
      response.pipe(output);
      output.on("finish", () => output.close(resolve));
      output.on("error", reject);
    });
    request.on("error", reject);
  });
}

export async function getLlmStatus({ baseDir } = {}) {
  const dir = modelDir(baseDir);
  let ggufModels = [];
  try {
    const files = await fs.readdir(dir);
    ggufModels = files.filter((file) => file.endsWith(".gguf"));
  } catch {
    ggufModels = [];
  }

  let ollamaModels = [];
  const ollamaAvailable = await isOllamaAvailable();
  if (ollamaAvailable) {
    ollamaModels = await listOllamaModels().catch(() => []);
  }

  const models = [...ggufModels, ...ollamaModels];
  return {
    available: models.length > 0,
    models,
    modelPath: ((): string | null => {
      const fallback = ollamaModels.length > 0 ? ollamaModels[0] : null;
      return ggufModels.length > 0 ? path.join(dir, ggufModels[0]) : fallback;
    })(),
    provider: ((): string | null => {
      const fallback = ollamaModels.length > 0 ? "ollama" : null;
      return ggufModels.length > 0 ? "node-llama-cpp" : fallback;
    })(),
    ollamaAvailable,
  };
}

export async function getLocalLlmStatus({
  verifyRuntime = verifyLocalLlmRuntime,
} = {}) {
  const modelDir = path.join(os.homedir(), ".vscode-rotator", "models");
  let models = [];

  try {
    const files = await fs.readdir(modelDir);
    models = files.filter((file) => file.endsWith(".gguf"));
  } catch {
    models = [];
  }

  if (models.length === 0) {
    return { status: "unavailable", modelDir, models };
  }

  try {
    await verifyRuntime();
  } catch {
    return { status: "degraded", modelDir, models };
  }

  return { status: "ready", modelDir, models };
}

export async function setupModel({ model = "phi3", modelPath, baseDir } = {}) {
  const cfg = await loadConfig();
  assertFeatureEnabled(cfg, "llmCommandsEnabled", "llm.setupModel");
  const provider = await resolvePreferredLlmProvider();
  if (provider === "ollama") {
    const requestedModel = modelPath
      ? String(modelPath).trim()
      : (OLLAMA_MODEL_REGISTRY[model] ?? OLLAMA_MODEL_REGISTRY.phi3);
    if (!requestedModel) {
      throw new Error("Ollama model name is required for setup.");
    }
    await installOllamaModel(requestedModel);
    return { provider: "ollama", modelPath: requestedModel };
  }

  const dir = modelDir(baseDir);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  if (model === "custom" && !modelPath) {
    throw new Error("--model custom requires --model-path /path/to/model.gguf");
  }
  const registry =
    model === "custom" && modelPath
      ? { name: path.basename(modelPath), url: null, sha256: null }
      : (MODEL_REGISTRY[model] ?? MODEL_REGISTRY.phi3);
  const target = path.join(dir, registry.name);

  if (modelPath) {
    await fs.copyFile(path.resolve(modelPath), target);
  } else {
    await download(registry.url, target);
  }

  const digest = await sha256(target);
  if (registry.sha256 && digest !== registry.sha256) {
    await fs.unlink(target);
    throw new Error(`SHA256 mismatch for ${registry.name}`);
  }

  const inference = new LocalLlmInference({ baseDir, modelPath: target });
  const response = await inference.generate({ prompt: "Hello" });
  return { modelPath: target, sha256: digest, response };
}

export async function askLocalLlm({
  question,
  system,
  baseDir,
  modelPath,
} = {}) {
  const cfg = await loadConfig();
  assertFeatureEnabled(cfg, "llmCommandsEnabled", "llm.askLocalLlm");
  const inference = new LocalLlmInference({ baseDir, modelPath });
  return inference.generate({ prompt: question, system });
}

export async function ingestDocuments(options = {}) {
  const correlationId = options.targetPath || "snapshot";
  log.info("llm.ingest.start", {
    correlationId,
    targetPath: options.targetPath || null,
  });
  try {
    const ingester = new DocumentIngester(options);
    const result = options.targetPath
      ? await ingester.ingestPath(options.targetPath)
      : await ingester.ingestFromSnapshot(options);
    const actionsCount = Array.isArray(result)
      ? result.length
      : (result?.actions?.length ?? 0);
    log.info("llm.ingest.success", { correlationId, actions: actionsCount });
    return result;
  } catch (err) {
    log.error("llm.ingest.failure", {
      correlationId,
      error: err,
      code: err?.code || "ROTATOR_LLM_INGEST_FAILED",
    });
    throw err;
  }
}

export async function addMistake(options = {}) {
  const tracker = new MistakeTracker(options);
  return tracker.addMistake(options);
}

export async function importSprints({ baseDir, sprintBaseDir } = {}) {
  const correlationId = baseDir || "default";
  log.info("llm.sprints.import.start", {
    correlationId,
    sprintBaseDir: sprintBaseDir || null,
  });
  const db = new ExperienceDb({ baseDir });
  let opened = false;
  try {
    await db.open();
    opened = true;
    const sprints = await listSprints({ baseDir: sprintBaseDir });
    let mistakes = 0;
    const tracker = new MistakeTracker({ baseDir, db });
    for (const sprint of sprints) {
      await db.upsertSprint(sprint);
      for (const failure of sprint.testsFailed ?? []) {
        await tracker.addMistake({
          sprint_id: sprint.sprintId,
          description: `Test failed: ${failure.name}`,
          root_cause: failure.error,
          fix_applied: "Review failing test during next sprint.",
          category: "test-failure",
        });
        mistakes++;
      }
    }
    const result = { imported: sprints.length, mistakes };
    log.info("llm.sprints.import.success", { correlationId, ...result });
    return result;
  } catch (err) {
    log.error("llm.sprints.import.failure", {
      correlationId,
      error: err,
      code: err?.code || "ROTATOR_LLM_SPRINT_IMPORT_FAILED",
    });
    throw err;
  } finally {
    if (opened) {
      await db.close();
    }
  }
}

export async function generatePrompt(options = {}) {
  const generator = new PromptGenerator(options);
  return generator.generate(options);
}

export function modulePath() {
  return fileURLToPath(import.meta.url);
}
