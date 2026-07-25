async function sendPromptToVscode(vscodeApi, promptText) {
  return vscodeApi.commands.executeCommand("workbench.action.chat.open", {
    query: promptText,
    isPartialQuery: true,
  });
}

export { sendPromptToVscode };
