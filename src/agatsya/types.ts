export class SubtaskPacket {
  subtask_id;
  expert;
  depends_on;
  contract_ref;
  environment_ref;
  instruction;
  context;
  constraints;
  validation_hooks;

  constructor(payload) {
    this.subtask_id = payload.subtask_id;
    this.expert = payload.expert;
    this.depends_on = payload.depends_on ?? [];
    this.contract_ref = payload.contract_ref;
    this.environment_ref = payload.environment_ref;
    this.instruction = payload.instruction;
    this.context = payload.context ?? {};
    this.constraints = payload.constraints ?? [];
    this.validation_hooks = payload.validation_hooks ?? [];

    if (
      !payload.expert ||
      typeof payload.expert !== "string" ||
      payload.expert.trim() === ""
    ) {
      throw new Error("SubtaskPacket requires a non-empty expert");
    }

    if (
      !payload.instruction ||
      typeof payload.instruction !== "string" ||
      payload.instruction.trim() === ""
    ) {
      throw new Error("SubtaskPacket requires a non-empty instruction");
    }
  }
}

export class SubtaskResponse {
  constructor(payload = {}) {
    Object.assign(this, payload);
  }

  toJSON() {
    return { ...this };
  }
}
