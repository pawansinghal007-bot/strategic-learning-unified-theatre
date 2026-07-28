import { describe, it, expect, vi } from "vitest";

import { sendPromptToVscode } from "../../vscode-extension/agent-bridge.mjs";

describe("sendPromptToVscode", () => {
  it("opens Copilot Chat with the prompt prefilled", async () => {
    const executeCommand = vi.fn().mockResolvedValue(true);
    const mockVscodeApi = {
      commands: {
        executeCommand,
      },
    };

    await sendPromptToVscode(mockVscodeApi, "implement function X");

    expect(executeCommand).toHaveBeenCalledWith("workbench.action.chat.open", {
      query: "implement function X",
      isPartialQuery: true,
    });
  });
});
