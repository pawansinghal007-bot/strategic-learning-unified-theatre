import { stableHash } from "../../llm/agent-loop-guard.js";

let tokenizer = null;
let tokenizerLoadError = null;

export async function getTokenizer() {
  if (tokenizer) return tokenizer;
  if (tokenizerLoadError) throw tokenizerLoadError;

  try {
    const { GPT2Tokenizer } = await import("@xenova/transformers");
    tokenizer = await GPT2Tokenizer.from_pretrained("gpt2");
    return tokenizer;
  } catch (error) {
    tokenizerLoadError =
      error instanceof Error ? error : new Error(String(error));
    throw tokenizerLoadError;
  }
}

export async function countTokens(text) {
  const source = String(text || "");

  try {
    const tok = await getTokenizer();
    const encoded = tok.encode(source);
    if (Array.isArray(encoded)) {
      return encoded.length;
    }
    if (typeof encoded?.length === "number") {
      return encoded.length;
    }
  } catch {
    // Fallback to a conservative char-based estimate when tokenizer is unavailable.
  }

  return Math.ceil(source.length / 4);
}

export function safeChunkHash(chunk) {
  return (
    chunk.chunk_hash ??
    chunk.hash ??
    chunk.chunkId ??
    chunk.chunk_id ??
    stableHash(String(chunk.text ?? chunk.content ?? ""))
  );
}
