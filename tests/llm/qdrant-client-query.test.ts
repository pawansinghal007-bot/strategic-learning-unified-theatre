import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { queryTopK } from "../../src/llm/qdrant-client.js";

vi.mock("../../src/knowledge/ingest/embedder.js", () => ({
  embedTextBatch: vi.fn(),
}));

import { embedTextBatch } from "../../src/knowledge/ingest/embedder.js";

describe("queryTopK", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(embedTextBatch).mockResolvedValue([[0.1, 0.2]]);
  });

  afterEach(() => {
    // restore fetch if needed
    // @ts-ignore
    delete global.fetch;
  });

  it("embeds and queries Qdrant, mapping content->text", async () => {
    // @ts-ignore
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        result: [
          { payload: { content: "relevant chunk A" }, score: 0.9 },
          { payload: { content: "relevant chunk B" }, score: 0.7 },
        ],
      }),
    });

    const res = await queryTopK("what does X do", 5);

    expect(vi.mocked(embedTextBatch)).toHaveBeenCalledWith(["what does X do"]);
    // @ts-ignore
    expect(global.fetch).toHaveBeenCalled();
    // @ts-ignore
    const calledUrl = global.fetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/collections/knowledge_chunks/points/search");
    // @ts-ignore
    const fetchOpts = global.fetch.mock.calls[0][1];
    const body = JSON.parse(fetchOpts.body);
    expect(body.limit).toBe(5);
    expect(body.vector).toBeDefined();

    expect(res).toEqual([
      { text: "relevant chunk A", score: 0.9 },
      { text: "relevant chunk B", score: 0.7 },
    ]);
  });

  it("returns [] when Qdrant responds not ok", async () => {
    // @ts-ignore
    global.fetch = vi.fn().mockResolvedValue({ ok: false });
    const res = await queryTopK("what", 5);
    expect(res).toEqual([]);
  });
});
