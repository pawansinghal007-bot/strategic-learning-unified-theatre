# V11 — Local Model Switch Function

**Engine**: Engine 10 (Platform Manager)
**Question**: Is there a function that changes the active local model at runtime, or is the model path hardcoded?

---

## Commands Run

```bash
# 1. Read local-llm.js (full file)
cat src/llm/local-llm.js

# 2. Read inference.js (full file)
cat src/llm/inference.js

# 3. Search for model switching functions
grep -rn "switchModel\|changeModel\|setModel\|updateModel\|activeModel\|currentModel\|selectModel\|setActiveModel\|switch.*model\|change.*model" src/llm/local-llm.js src/llm/inference.js

# 4. Search for all model path references in inference.js
grep -rn "modelPath\|DEFAULT_OLLAMA_MODEL\|MODEL_REGISTRY\|model.*=.*\|\.model\b" src/llm/inference.js

# 5. Search for all model path references in local-llm.js
grep -rn "modelPath\|MODEL_REGISTRY\|\.model\b" src/llm/local-llm.js
```

## Terminal Output

**Command 3 — Model switching functions:**

```
src/llm/inference.js:323:    const model = await runtime.loadModel({ modelPath });
```

(Only one match — `loadModel` is a node-llama-cpp internal call, not a user-facing switch function)

**Command 4 — Model path references in inference.js:**

```
16:const DEFAULT_OLLAMA_MODEL = process.env.VSCODE_ROTATOR_OLLAMA_MODEL ?? "phi3:mini"
211:  modelPath,
215:  const modelArg = modelPath ?? DEFAULT_OLLAMA_MODEL;
250:    modelPath,
256:    this.modelPath = modelPath;
263:    if (this.modelPath) return this.modelPath;
277:      const modelPath = await this.resolveModelPath();
288:      if (this.modelPath) {
314:      const modelPath = await this.assertReady();
318:      const modelPath = await this.assertReady();
323:      const model = await runtime.loadModel({ modelPath });
```

**Command 5 — Model path references in local-llm.js:**

```
27:export const MODEL_REGISTRY = { phi3: {...}, tinyllama: {...} }
40:export const OLLAMA_MODEL_REGISTRY = { phi3: "phi3:mini", tinyllama: "tinyllama" }
110:  let modelPath = fallbackModel;
112:    modelPath = path.join(dir, ggufModels[0]);
125:    modelPath,
157:export async function setupModel({ model = "phi3", modelPath, baseDir } = {})
163:    if (modelPath) { requestedModel = String(modelPath).trim(); }
172:    return { provider: "ollama", modelPath: requestedModel };
181:  if (model === "custom" && modelPath) { ... }
200:  const inference = new LocalLlmInference({ baseDir, modelPath: target });
202:  return { modelPath: target, sha256: digest, response };
209:  modelPath,
213:  const inference = new LocalLlmInference({ baseDir, modelPath });
```

## Code Evidence

### `src/llm/inference.js` — DEFAULT_OLLAMA_MODEL (line 16)

```javascript
const DEFAULT_OLLAMA_MODEL =
  process.env.VSCODE_ROTATOR_OLLAMA_MODEL ?? "phi3:mini";
```

**Observation**: Hardcoded default with env var override only. No runtime switch function.

### `src/llm/inference.js` — runOllama (lines 209-228)

```javascript
async function runOllama({
  prompt,
  modelPath,
  timeout = OLLAMA_DEFAULT_TIMEOUT_MS,
} = {}) {
  const binary = await findOllamaBinary();
  const modelArg = modelPath ?? DEFAULT_OLLAMA_MODEL;
  // ...
}
```

**Observation**: Accepts `modelPath` as a per-call parameter, but this is not a persistent switch — each call must pass it explicitly.

### `src/llm/inference.js` — LocalLlmInference class (lines 247-260)

```javascript
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
```

**Observation**: `modelPath` is set at construction time. No `setModelPath()` or `switchModel()` method exists on the class.

### `src/llm/inference.js` — resolveModelPath (lines 262-272)

```javascript
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
```

**Observation**: Falls back to first `.gguf` file found in model dir. No model selection logic.

### `src/llm/local-llm.js` — MODEL_REGISTRY (lines 27-38)

```javascript
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
```

**Observation**: Static registry of 2 models. No dynamic registration.

### `src/llm/local-llm.js` — setupModel (lines 157-202)

```javascript
export async function setupModel({ model = "phi3", modelPath, baseDir } = {}) {
  const provider = await resolvePreferredLlmProvider();
  if (provider === "ollama") {
    let requestedModel;
    if (modelPath) {
      requestedModel = String(modelPath).trim();
    } else {
      requestedModel =
        OLLAMA_MODEL_REGISTRY[model] ?? OLLAMA_MODEL_REGISTRY.phi3;
    }
    await installOllamaModel(requestedModel);
    return { provider: "ollama", modelPath: requestedModel };
  }
  // ... GGUF download path ...
  const inference = new LocalLlmInference({ baseDir, modelPath: target });
  const response = await inference.generate({ prompt: "Hello" });
  return { modelPath: target, sha256: digest, response };
}
```

**Observation**: `setupModel` is a one-time install/download function, not a runtime switch. It downloads a model then creates a new `LocalLlmInference` instance.

### `src/llm/local-llm.js` — askLocalLlm (lines 205-213)

```javascript
export async function askLocalLlm({
  question,
  system,
  baseDir,
  modelPath,
} = {}) {
  const inference = new LocalLlmInference({ baseDir, modelPath });
  return inference.generate({ prompt: question, system });
}
```

**Observation**: Creates a new `LocalLlmInference` per call with optional `modelPath`. This is per-invocation, not a persistent switch.

### `src/llm/inference.js` — askOpenAiCompat (lines 383-403)

```javascript
export async function askOpenAiCompat(prompt, model) {
  const modelsRes = await fetch(`${OPENAI_COMPAT_URL}/v1/models`);
  const modelsData = await modelsRes.json();
  const availableModel =
    model ??
    (modelsData.models ?? modelsData.data ?? [])[0]?.name ??
    (modelsData.models ?? modelsData.data ?? [])[0]?.id;
  // ...
}
```

**Observation**: Accepts `model` as a per-call parameter for OpenAI-compatible endpoints. Not a persistent switch.

### No switchModel/setModel/changeModel function found

```
grep output: Only one match — runtime.loadModel() (line 323), which is a node-llama-cpp internal call, not a user-facing API.
```

## Verdict

**Partial/integration unclear**

## Notes

No dedicated runtime model-switch function exists (no `switchModel`, `setModel`, `changeModel`, or `setActiveModel`). Model selection is achieved through three disjoint mechanisms: (1) constructor-time `modelPath` on `LocalLlmInference`, (2) per-call `modelPath` parameter on `askLocalLlm`/`runOllama`/`askOpenAiCompat`, and (3) env var `VSCODE_ROTATOR_OLLAMA_MODEL` for the default. There is no persistent "active model" state that can be changed at runtime — each invocation creates a new inference instance or passes the model inline. The `MODEL_REGISTRY` is static (2 models) with no dynamic registration.
---

## Comment by Grok

**Independent re-check (2026-07-21): Agree with verdict — Partial/integration unclear.**

Confirmed: `setupModel` in `local-llm.js` (CLI-wired), constructor/`modelPath` args, env `VSCODE_ROTATOR_OLLAMA_MODEL`, static `MODEL_REGISTRY` / `OLLAMA_MODEL_REGISTRY`. No persistent runtime `switchModel` / active-model state API. Correct nuance vs pure “Missing.” No material corrections.
