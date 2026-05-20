import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function defaultModelDir(baseDir) {
  return path.join(baseDir ?? path.join(os.homedir(), ".vscode-rotator"), "models");
}

async function exists(filePath) {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export class LocalLlmInference {
  constructor({ baseDir, modelPath, contextSize = 4096, temperature = 0.3, topP = 0.9 } = {}) {
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
    const modelPath = await this.resolveModelPath();
    if (!modelPath || !(await exists(modelPath))) {
      throw new Error("No local LLM model found. Run: vscode-rotator llm setup --model phi3");
    }
    try {
      await import("node-llama-cpp");
    } catch {
      throw new Error("node-llama-cpp is not installed. Install dependencies, then rerun llm setup.");
    }
    return modelPath;
  }

  async generate({ prompt, system = "" }) {
    if (process.env.VSCODE_ROTATOR_MOCK_LLM) {
      return `${system ? `${system}\n\n` : ""}${prompt}`.slice(0, 1200);
    }

    const modelPath = await this.assertReady();
    const llama = await import("node-llama-cpp");
    const getLlama = llama.getLlama ?? llama.default?.getLlama;
    if (!getLlama) throw new Error("Unsupported node-llama-cpp version.");
    const runtime = await getLlama();
    const model = await runtime.loadModel({ modelPath });
    const context = await model.createContext({ contextSize: this.contextSize });
    const session = new llama.LlamaChatSession({ contextSequence: context.getSequence() });
    const fullPrompt = system ? `${system}\n\n${prompt}` : prompt;
    const response = await session.prompt(fullPrompt, {
      temperature: this.temperature,
      topP: this.topP
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
