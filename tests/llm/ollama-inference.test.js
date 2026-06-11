process.env.VSCODE_ROTATOR_LLM_PROVIDER = 'ollama';
process.env.VSCODE_ROTATOR_OLLAMA_BIN = 'ollama';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../src/llm/inference.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, verifyOllamaInstalled: vi.fn().mockResolvedValue(true) };
});

import { verifyOllamaInstalled, resolvePreferredLlmProvider, LocalLlmInference } from '../../src/llm/inference.js';

describe('Ollama fallback inference', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('verifies runtime', async () => {
    await expect(verifyOllamaInstalled()).resolves.toBe(true);
  });

  it('resolves provider', async () => {
    await expect(resolvePreferredLlmProvider()).resolves.toBe('ollama');
  });

  it('generates response', async () => {
    const inference = new LocalLlmInference({ baseDir: '.', modelPath: null });
    vi.spyOn(inference, 'generate').mockResolvedValue('Hi from Ollama');
    const response = await inference.generate({ prompt: 'Hello world', system: '' });
    expect(response).toBe('Hi from Ollama');
  });
});