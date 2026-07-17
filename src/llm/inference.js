import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "./_child-process.js";
import { promisify } from "node:util";

function getExecFileAsync() {
  return promisify(execFile);
}
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const OLLAMA_DEFAULT_TIMEOUT_MS = 180000;
const DEFAULT_OLLAMA_MODEL =
  process.env.VSCODE_ROTATOR_OLLAMA_MODEL ?? "phi3:mini";
const OLLAMA_BIN_ENV =
  process.env.VSCODE_ROTATOR_OLLAMA_BIN ?? process.env.OLLAMA_PATH;

async function importOptional(moduleName) {
  return await new Function("moduleName", "return import(moduleName);")(
    moduleName,
  );
}

async function fileExists(filePath) {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

// v8 ignore start
function getWindowsOllamaCandidates() {
  const localAppData = process.env.LOCALAPPDATA;
  const programFiles = process.env.ProgramFiles;
  const programFilesx86 = process.env["ProgramFiles(x86)"];

  return [
    ...(localAppData
      ? [path.join(localAppData, "Programs", "Ollama", "ollama.exe")]
      : []),
    ...(programFiles ? [path.join(programFiles, "Ollama", "ollama.exe")] : []),
    ...(programFilesx86
      ? [path.join(programFilesx86, "Ollama", "ollama.exe")]
      : []),
  ];
}
// v8 ignore end

async function findOllamaBinary() {
  const candidates = [
    ...(typeof OLLAMA_BIN_ENV === "string" && OLLAMA_BIN_ENV.trim()
      ? [OLLAMA_BIN_ENV.trim()]
      : []),
    // v8 ignore next
    ...(process.platform === "win32" ? getWindowsOllamaCandidates() : []),
    "ollama",
    "ollama.exe",
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (candidate === "ollama" || candidate === "ollama.exe") return candidate;
    if (await fileExists(candidate)) return candidate;
  }

  throw new Error(
    "Ollama binary not found. Install Ollama or set VSCODE_ROTATOR_OLLAMA_BIN to the executable path.",
  );
}

export async function verifyOllamaInstalled() {
  const binary = await findOllamaBinary();
  try {
    await getExecFileAsync()(binary, ["--version"], { timeout: 10000 });
    return true;
  } catch (error) {
    throw new Error(
      `Ollama runtime not available: ${String(error?.message ?? error)}`,
    );
  }
}

export async function isOllamaAvailable() {
  try {
    await findOllamaBinary();
    return true;
  } catch {
    return false;
  }
}

export async function isNodeLlamaCppInstalled() {
  try {
    await importOptional("node-llama-cpp");
    return true;
  } catch {
    return false;
  }
}

export async function resolvePreferredLlmProvider() {
  const configured = (process.env.VSCODE_ROTATOR_LLM_PROVIDER ?? "")
    .trim()
    .toLowerCase();

  if (configured === "ollama") return "ollama";
  if (configured === "node-llama-cpp") return "node-llama-cpp";

  if (await isNodeLlamaCppInstalled()) return "node-llama-cpp";
  if (await isOllamaAvailable()) return "ollama";

  throw new Error(
    "No local inference provider available. Install node-llama-cpp or Ollama and set VSCODE_ROTATOR_LLM_PROVIDER if needed.",
  );
}

export async function verifyLocalLlmRuntime() {
  const provider = await resolvePreferredLlmProvider();
  if (provider === "node-llama-cpp") {
    await importOptional("node-llama-cpp");
    return true;
  }
  return await verifyOllamaInstalled();
}

export async function verifyNodeLlamaCppInstalled() {
  return verifyLocalLlmRuntime();
}

function parseOllamaOutput(output) {
  const lines = output.replaceAll("\r", "").split(/\n/);
  // Strip trailing blank lines first, then trailing --- separator lines
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
    lines.pop();
  }
  while (lines.length > 0 && lines[lines.length - 1].trim() === "---") {
    lines.pop();
  }
  return lines.join("\n").trim();
}

function parseOllamaListOutput(output) {
  const normalized = String(output ?? "")
    .replaceAll("\r", "")
    .trim();
  if (!normalized) return [];

  try {
    const parsed = JSON.parse(normalized);
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => item?.name || item?.model || String(item))
        .filter(Boolean);
    }
  } catch {
    // Fallback to plain table parsing
  }

  const lines = normalized
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const headerIndex = lines.findIndex((line) => /^NAME\b/i.test(line));
  const rows = headerIndex >= 0 ? lines.slice(headerIndex + 1) : lines;
  return rows.map((line) => line.split(/\s+/)[0]).filter(Boolean);
}

export async function listOllamaModels() {
  const binary = await findOllamaBinary();
  try {
    const { stdout } = await getExecFileAsync()(binary, ["list", "--json"], {
      timeout: 10000,
      maxBuffer: 50 * 1024 * 1024,
    });
    return parseOllamaListOutput(stdout);
  } catch {
    try {
      const { stdout } = await getExecFileAsync()(binary, ["list"], {
        timeout: 10000,
        maxBuffer: 50 * 1024 * 1024,
      });
      return parseOllamaListOutput(stdout);
    } catch {
      return [];
    }
  }
}

export async function installOllamaModel(modelName) {
  const binary = await findOllamaBinary();
  try {
    await getExecFileAsync()(binary, ["pull", modelName], {
      timeout: 600000,
      maxBuffer: 50 * 1024 * 1024,
    });
    return true;
  } catch (error) {
    throw new Error(
      `Ollama install failed: ${String(error?.message ?? error)}`,
    );
  }
}

async function runOllama({
  prompt,
  modelPath,
  timeout = OLLAMA_DEFAULT_TIMEOUT_MS,
} = {}) {
  const binary = await findOllamaBinary();
  const modelArg = modelPath ?? DEFAULT_OLLAMA_MODEL;

  try {
    const { stdout } = await getExecFileAsync()(
      binary,
      ["run", modelArg, prompt],
      {
        timeout,
        maxBuffer: 50 * 1024 * 1024,
      },
    );
    return parseOllamaOutput(stdout);
  } catch (error) {
    throw new Error(
      `Ollama execution failed: ${String(error?.message ?? error)}`,
    );
  }
}

function defaultModelDir(baseDir) {
  return path.join(
    baseDir ?? path.join(os.homedir(), ".vscode-rotator"),
    "models",
  );
}

async function ollamaModelExists(modelName) {
  if (!modelName) return false;
  const models = await listOllamaModels();
  return models.includes(String(modelName).trim());
}

export class LocalLlmInference {
  constructor({
    baseDir,
    modelPath,
    contextSize = 4096,
    temperature = 0.3,
    topP = 0.9,
  } = {}) {
    this.baseDir = baseDir;
    this.modelPath = modelPath;
    this.contextSize = contextSize;
    this.temperature = temperature;
    this.topP = topP;
  }

  async resolveModelPath() {
    if (this.modelPath) return this.modelPath;
    const modelDir = defaultModelDir(this.baseDir);
    try {
      const files = await fs.readdir(modelDir);
      const gguf = files.find((file) => file.endsWith(".gguf"));
      if (gguf) return path.join(modelDir, gguf);
    } catch {}
    return null;
  }

  async assertReady() {
    const provider = await resolvePreferredLlmProvider();

    if (provider === "node-llama-cpp") {
      const modelPath = await this.resolveModelPath();
      if (!modelPath || !(await fileExists(modelPath))) {
        throw new Error(
          "No local LLM model found. Run: strategic-learning-unified-theatre llm setup --model phi3",
        );
      }
      await verifyLocalLlmRuntime();
      return modelPath;
    }

    if (provider === "ollama") {
      if (this.modelPath) {
        if (await fileExists(this.modelPath)) {
          return this.modelPath;
        }
        if (await ollamaModelExists(this.modelPath)) {
          return this.modelPath;
        }
        throw new Error(`Local Ollama model not found: ${this.modelPath}`);
      }
      await verifyOllamaInstalled();
      return null;
    }

    throw new Error("Unsupported local inference provider.");
  }

  async generate({ prompt, system = "" }) {
    if (process.env.VSCODE_ROTATOR_MOCK_LLM) {
      const systemPrefix = system ? `${system}\n\n` : "";
      return `${systemPrefix}${prompt}`.slice(0, 1200);
    }

    const fullPrompt = system ? `${system}\n\n${prompt}` : prompt;
    const provider = await resolvePreferredLlmProvider();

    if (provider === "ollama") {
      const modelPath = await this.assertReady();
      return runOllama({ prompt: fullPrompt, modelPath });
    }

    const modelPath = await this.assertReady();
    const llama = await importOptional("node-llama-cpp");
    const getLlama = llama.getLlama ?? llama.default?.getLlama;
    if (!getLlama) throw new Error("Unsupported node-llama-cpp version.");
    const runtime = await getLlama({ gpu: false, build: "lastBuild" });
    const model = await runtime.loadModel({ modelPath });
    const context = await model.createContext({
      contextSize: this.contextSize,
    });
    const session = new llama.LlamaChatSession({
      contextSequence: context.getSequence(),
    });
    const response = await session.prompt(fullPrompt, {
      temperature: this.temperature,
      topP: this.topP,
    });

    if (typeof context.free === "function") {
      await context.free();
    }
    if (typeof model.freeModel === "function") {
      await model.freeModel();
    }

    return response;
  }
}

// ── OpenAI-compatible provider (e.g. llama.cpp server on port 8080) ──────────
const OPENAI_COMPAT_URL =
  process.env.LOCAL_LLM_OPENAI_URL ?? "http://localhost:8080";

export async function isOpenAiCompatAvailable() {
  try {
    const res = await fetch(`${OPENAI_COMPAT_URL}/v1/models`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function listOpenAiCompatModels() {
  try {
    const res = await fetch(`${OPENAI_COMPAT_URL}/v1/models`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.models ?? data.data ?? []).map(
      (m) => m.name ?? m.id ?? String(m),
    );
  } catch {
    return [];
  }
}

export async function askOpenAiCompat(prompt, model) {
  const modelsRes = await fetch(`${OPENAI_COMPAT_URL}/v1/models`);
  const modelsData = await modelsRes.json();
  const availableModel =
    model ??
    (modelsData.models ?? modelsData.data ?? [])[0]?.name ??
    (modelsData.models ?? modelsData.data ?? [])[0]?.id;

  const res = await fetch(`${OPENAI_COMPAT_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: availableModel,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 1024,
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`LLM request failed: ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}
