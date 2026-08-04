/**
 * training-trigger.js
 *
 * Spawns the Unsloth LoRA fine-tuning studio via the confirmed
 * wt.exe → wsl.exe → launch-studio.sh invocation.
 *
 * `spawn` is imported from the user-land wrapper `_child-process.js` so that
 * Vitest can intercept it via vi.mock() — Vite externalises node: built-ins
 * and cannot mock them directly; a local re-export module is processed through
 * Vite's transform pipeline and is therefore fully mockable.
 *
 * Pre-conditions (confirmed manually before Sprint 116):
 *   2. WSL Ubuntu-22.04 distro is present and accessible via wt.exe.
 *   3. /home/pawan/.local/share/unsloth/launch-studio.sh is installed and
 *      executable inside the WSL environment.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "./_child-process.js";

const UNSLOTH_BINARY = "/home/pawan/.unsloth/studio/unsloth_studio/bin/unsloth";
const TRAIN_OUTPUT_DIR = "/home/pawan/.local/share/unsloth/outputs";
const DEFAULT_UNSLOTH_MODEL = process.env.VSCODE_ROTATOR_UNSLOTH_MODEL ?? "phi3";
const DEFAULT_UNSLOTH_MODEL_PATHS = [
  process.env.VSCODE_ROTATOR_UNSLOTH_MODEL_PATH,
  "/mnt/d/ai/models",
  "/mnt/c/ai/models",
  path.join(os.homedir(), "models"),
];

const HUGGINGFACE_HUB_CACHE = path.join(os.homedir(), ".cache", "huggingface", "hub");

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

async function findFirstGgufInDir(modelDir) {
  const entries = await fs.readdir(modelDir, { withFileTypes: true });
  const ggufFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".gguf"))
    .map((entry) => entry.name)
    .sort();

  if (ggufFiles.length > 0) {
    return path.join(modelDir, ggufFiles[0]);
  }
  return null;
}

async function findFirstSafetensorsInHub(hubDir) {
  try {
    const entries = await fs.readdir(hubDir, { withFileTypes: true });
    // look for model folders named models--<owner>--<repo>
    const modelDirs = entries
      .filter((e) => e.isDirectory() && e.name.startsWith("models--"))
      .map((e) => path.join(hubDir, e.name));

    for (const md of modelDirs) {
      try {
        const files = await fs.readdir(md, { withFileTypes: true });
        const safetensors = files
          .filter((f) => f.isFile() && f.name.endsWith(".safetensors"))
          .map((f) => f.name)
          .sort();
        if (safetensors.length > 0) {
          return path.join(md, safetensors[0]);
        }
      } catch {
        continue;
      }
    }
  } catch {
    // hub not present or unreadable
  }
  return null;
}

async function discoverLocalModelPath(modelPath) {
  if (modelPath) {
    return path.resolve(modelPath);
  }

  // Prefer safetensors found in the HF hub cache (trained-capable format)
  const hf = await findFirstSafetensorsInHub(HUGGINGFACE_HUB_CACHE);
  if (hf) return hf;

  for (const candidate of DEFAULT_UNSLOTH_MODEL_PATHS) {
    if (!candidate) continue;
    try {
      const stats = await fs.stat(candidate);
      if (stats.isFile() && candidate.endsWith(".gguf")) {
        return candidate;
      }
      if (stats.isDirectory()) {
        const resolved = await findFirstGgufInDir(candidate);
        if (resolved) {
          return resolved;
        }
      }
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Trigger Unsloth LoRA training by launching the Unsloth CLI inside WSL.
 *
 * @param {string} datasetPath - Absolute path to the exported JSONL training file.
 * @param {object} [options]
 * @param {string} [options.model] - Model name to pass to Unsloth.
 * @param {string} [options.modelPath] - Local path to a model file.
 * @returns {Promise<void>} Resolves when the training process exits with code 0;
 *                          rejects with an error describing the non-zero exit code.
 */
export async function triggerLoraTraining(datasetPath, { model, modelPath } = {}) {
  const localModelPath = await discoverLocalModelPath(modelPath);
  const effectiveModel = localModelPath ? localModelPath : model ?? DEFAULT_UNSLOTH_MODEL;
  const escapedDatasetPath = shellQuote(datasetPath);
  const modelArg = `--model ${shellQuote(effectiveModel)}`;

  return new Promise((resolve, reject) => {
    const child = spawn(
      "wt.exe",
      [
        "wsl.exe",
        "-d",
        "Ubuntu-22.04",
        "--",
        "bash",
        "-l",
        "-c",
        `exec '${UNSLOTH_BINARY}' train ${modelArg} --local-dataset ${escapedDatasetPath} --format-type jsonl --output-dir '${TRAIN_OUTPUT_DIR}'`,
      ],
      { shell: false },
    );

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `Unsloth training process exited with non-zero code: ${code}`,
          ),
        );
      }
    });
  });
}
