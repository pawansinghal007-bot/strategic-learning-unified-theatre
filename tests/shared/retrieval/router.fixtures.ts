/**
 * tests/shared/retrieval/router.fixtures.ts
 *
 * Fixture data for router tests.
 *
 * This is a plain data array, NOT a test file. It defines test cases
 * for the chooseStrategy function.
 */

import type { RetrievalStrategy } from "../../../src/shared/retrieval/router.js";

export const routerFixtures: Array<{
  query: string;
  mode?: RetrievalStrategy;
  expected: RetrievalStrategy;
}> = [
  // Symbol-like: camelCase
  { query: "runSubAgent", expected: "code" },
  { query: "executeToolCall", expected: "code" },

  // Symbol-like: PascalCase
  { query: "SubAgent", expected: "code" },
  { query: "ToolCall", expected: "code" },

  // Symbol-like: snake_case
  { query: "run_sub_agent", expected: "code" },
  { query: "execute_tool_call", expected: "code" },

  // Path-like: contains '/' AND ends in plausible file extension
  { query: "src/agents/sub-agent.ts", expected: "file" },
  { query: "src/shared/retrieval/router.ts", expected: "file" },
  { query: "docs/readme.md", expected: "file" },

  // Vector: natural language questions
  { query: "how does tool error propagation work", expected: "vector" },
  { query: "what does the retrieval router do", expected: "vector" },
  { query: "explain how the vector search works", expected: "vector" },

  // Quoted strings (exact match intent)
  { query: '"runSubAgent"', expected: "code" },
  { query: "'executeToolCall'", expected: "code" },

  // Regex metacharacters (intentional pattern)
  { query: "runSubAgent.*", expected: "code" },
  { query: "test\\[\\d+\\]", expected: "code" },

  // Override wins even when heuristic would say something else
  { query: "runSubAgent", mode: "vector", expected: "vector" },
  { query: "src/agents/sub-agent.ts", mode: "code", expected: "code" },
  { query: "how does it work", mode: "file", expected: "file" },

  // Edge case: ambiguous query (falls back to vector)
  { query: "the retrieval mechanism", expected: "vector" },

  // Edge case: single word that is not a recognized pattern (falls back to vector)
  { query: "function", expected: "vector" },
];
