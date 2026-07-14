import { retrieve } from "./router.js";
import {
  formatVectorResults,
  formatCodeHits,
  formatSymbolResults,
} from "./format.js";

export type ExecuteRetrieveResult = { text: string } | { error: string };

export async function executeRetrieve(
  query: string,
  opts?: {
    mode?: "code" | "vector" | "file" | "symbol";
    topK?: number;
    glob?: string;
    callerIdentity?: string;
  },
): Promise<ExecuteRetrieveResult> {
  try {
    const result = await retrieve(query, {
      mode: opts?.mode,
      topK: opts?.topK,
      glob: opts?.glob,
      callerIdentity: opts?.callerIdentity,
    });

    if (result.error) {
      return { error: `retrieve failed: ${result.error}` };
    }

    switch (result.strategy) {
      case "vector": {
        const formatted = formatVectorResults(result.results as any);
        return {
          text:
            formatted === ""
              ? "No matching results in the vector store."
              : formatted,
        };
      }
      case "code": {
        const formatted = formatCodeHits(result.results as any);
        return {
          text: formatted === "" ? `No matches for "${query}".` : formatted,
        };
      }
      case "symbol": {
        const formatted = formatSymbolResults(result.results as any);
        return {
          text:
            formatted === "" ? `No symbol found for "${query}".` : formatted,
        };
      }
      case "file": {
        return { text: result.results as string };
      }
      default: {
        const _exhaustive: never = result.strategy;
        throw new Error(`Unknown strategy: ${_exhaustive}`);
      }
    }
  } catch (error) {
    return {
      error: `retrieve failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
