import { SubtaskPacket } from "./types.ts";

export class Dispatcher {
  constructor({ registry, llmClient }) {
    this.registry = registry;
    this.llmClient = llmClient;
  }

  async route(input = {}) {
    const fileContext = input.fileContext ?? {};
    const path = fileContext.path ?? "";
    const confidence = fileContext.confidence ?? 0;
    const language = (fileContext.language ?? "").toLowerCase();

    const isJava = path.endsWith(".java") || language === "java";
    const isTypeScript =
      path.endsWith(".ts") ||
      path.endsWith(".tsx") ||
      language === "typescript" ||
      language === "ts";

    if (confidence >= 0.85 && (isJava || isTypeScript)) {
      const key = isJava ? "java@21" : "typescript@5.x";
      const matched = this.registry.resolve(key);
      const capability = matched[0];

      if (!capability) {
        return { status: "needs-stage-2", packet: undefined };
      }

      const packet = new SubtaskPacket({
        subtask_id: `subtask-${Date.now()}`,
        expert: capability.id,
        depends_on: [],
        contract_ref: "",
        environment_ref: "",
        instruction: `Implement the task for ${path}`,
        context: { path },
        constraints: [],
        validation_hooks: [],
      });

      return { status: "dispatched", packet };
    }

    return { status: "needs-stage-2", packet: undefined };
  }
}
