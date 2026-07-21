import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — plain vi.fn() refs at module top, then vi.mock delegates to them
// ---------------------------------------------------------------------------

const findIdeaById = vi.fn();
const updateIdea = vi.fn();

vi.mock("../src/idea-store.js", () => ({
  findIdeaById: (...a) => findIdeaById(...a),
  updateIdea: (...a) => updateIdea(...a),
}));

const sendPrompt = vi.fn();

vi.mock("../src/browser-bridge.js", () => ({
  sendPrompt: (...a) => sendPrompt(...a),
}));

// Import SUT AFTER mocks
import { refineIdea } from "../src/idea-refine.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ideaFixture = {
  id: "idea-1",
  body: "# Test Idea\nSome idea content",
  project: "test",
  status: "active",
  priority: 2,
  tags: [],
  linkedSprint: null,
  filePath: "/tmp/fake.md",
};

const perplexityResponse = {
  platform: "perplexity",
  prompt: "...",
  response: "Perplexity research text",
  responsePath: "/tmp/perplexity-response.md",
  timestamp: "2026-07-21T00:00:00Z",
};

const claudeResponse = {
  platform: "claude",
  prompt: "...",
  response: "Claude refinement text",
  responsePath: "/tmp/claude-response.md",
  timestamp: "2026-07-21T00:00:01Z",
};

const updatedIdeaFixture = {
  ...ideaFixture,
  researchNotes: "Perplexity research text",
  refinementNotes: "Claude refinement text",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("refineIdea", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    findIdeaById.mockResolvedValue(ideaFixture);
    sendPrompt.mockImplementation(async (req) => {
      if (req.platform === "perplexity") return perplexityResponse;
      if (req.platform === "claude") return claudeResponse;
      throw new Error(`Unknown platform: ${req.platform}`);
    });
    updateIdea.mockResolvedValue(updatedIdeaFixture);
  });

  it("calls sendPrompt twice in order (perplexity then claude)", async () => {
    await refineIdea("idea-1");

    expect(sendPrompt).toHaveBeenCalledTimes(2);

    expect(sendPrompt.mock.calls[0][0]).toMatchObject({
      platform: "perplexity",
      prompt: expect.stringContaining("Some idea content"),
    });

    expect(sendPrompt.mock.calls[1][0]).toMatchObject({
      platform: "claude",
      prompt: expect.stringContaining("Some idea content"),
    });
    expect(sendPrompt.mock.calls[1][0].prompt).toContain(
      "Perplexity research text",
    );
  });

  it("calls updateIdea once with researchNotes and refinementNotes", async () => {
    await refineIdea("idea-1");

    expect(updateIdea).toHaveBeenCalledTimes(1);
    expect(updateIdea).toHaveBeenCalledWith(
      "idea-1",
      {
        researchNotes: "Perplexity research text",
        refinementNotes: "Claude refinement text",
      },
      {},
    );
  });

  it("propagates findIdeaById rejection unchanged", async () => {
    findIdeaById.mockRejectedValue(new Error("not found"));

    await expect(refineIdea("idea-1")).rejects.toThrow("not found");

    expect(sendPrompt).not.toHaveBeenCalled();
    expect(updateIdea).not.toHaveBeenCalled();
  });

  it("propagates sendPrompt rejection unchanged", async () => {
    sendPrompt.mockRejectedValue(new Error("browser down"));

    await expect(refineIdea("idea-1")).rejects.toThrow("browser down");

    expect(updateIdea).not.toHaveBeenCalled();
  });

  it("propagates updateIdea rejection unchanged", async () => {
    updateIdea.mockRejectedValue(new Error("disk full"));

    await expect(refineIdea("idea-1")).rejects.toThrow("disk full");

    expect(sendPrompt).toHaveBeenCalledTimes(2);
  });
});
