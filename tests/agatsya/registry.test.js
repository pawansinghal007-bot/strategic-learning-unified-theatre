import { describe, expect, it } from "vitest";
import { CapabilityRegistry } from "../../src/agatsya/registry.ts";
import { SubtaskPacket, SubtaskResponse } from "../../src/agatsya/types.ts";

describe("CapabilityRegistry", () => {
  it("stores descriptors by id and resolves exact capability keys", () => {
    const registry = new CapabilityRegistry();

    registry.register({
      id: "java-expert",
      type: "language_expert",
      mechanism: "trained",
      role: "generative",
      version: "1.0.0",
      state: "Registered",
      capabilities: ["spring-boot@3.x"],
      environment: ["java-21", "maven"],
      io_contract: {
        accepts: { kind: "SubtaskPacket" },
        returns: { kind: "SubtaskResponse" },
      },
      permissions: ["read", "write"],
    });

    registry.register({
      id: "java-expert-legacy",
      type: "language_expert",
      mechanism: "trained",
      role: "validating",
      version: "0.9.0",
      state: "Deprecated",
      capabilities: ["spring-boot@2.x"],
      environment: ["java-17"],
      io_contract: {
        accepts: { kind: "SubtaskPacket" },
        returns: { kind: "SubtaskResponse" },
      },
      permissions: ["read"],
    });

    expect(registry.resolve("java-expert")).toEqual([]);
    expect(
      registry.resolve("spring-boot@3.x").map((descriptor) => descriptor.id),
    ).toEqual(["java-expert"]);
    expect(
      registry.resolve("spring-boot@2.x").map((descriptor) => descriptor.id),
    ).toEqual(["java-expert-legacy"]);
  });

  it("returns an empty list for an unregistered key without throwing", () => {
    const registry = new CapabilityRegistry();

    expect(() => registry.resolve("missing-key")).not.toThrow();
    expect(registry.resolve("missing-key")).toEqual([]);
    expect(registry.resolve()).toEqual([]);
  });
});

describe("SubtaskPacket", () => {
  it("constructs a packet with the expected fields and rejects invalid packets", () => {
    const packet = new SubtaskPacket({
      subtask_id: "subtask-001",
      expert: "java-expert",
      depends_on: [],
      contract_ref: "contract-001",
      environment_ref: "env-001",
      instruction: "Implement the service layer.",
      context: { file: "src/App.java" },
      constraints: ["use java 21"],
      validation_hooks: ["compile"],
    });

    expect(packet).toMatchObject({
      subtask_id: "subtask-001",
      expert: "java-expert",
      depends_on: [],
      contract_ref: "contract-001",
      environment_ref: "env-001",
      instruction: "Implement the service layer.",
      context: { file: "src/App.java" },
      constraints: ["use java 21"],
      validation_hooks: ["compile"],
    });
    expect(Object.keys(packet).sort()).toEqual([
      "constraints",
      "context",
      "contract_ref",
      "depends_on",
      "environment_ref",
      "expert",
      "instruction",
      "subtask_id",
      "validation_hooks",
    ]);

    expect(
      () =>
        new SubtaskPacket({
          subtask_id: "subtask-002",
          expert: "",
          depends_on: [],
          contract_ref: "contract-002",
          environment_ref: "env-002",
          instruction: "Do it.",
          context: {},
          constraints: [],
          validation_hooks: [],
        }),
    ).toThrow(/expert/i);

    expect(
      () =>
        new SubtaskPacket({
          subtask_id: "subtask-003",
          expert: "typescript-expert",
          depends_on: [],
          contract_ref: "contract-003",
          environment_ref: "env-003",
          instruction: "",
          context: {},
          constraints: [],
          validation_hooks: [],
        }),
    ).toThrow(/instruction/i);
  });

  it("applies packet defaults for optional list and context fields", () => {
    const packet = new SubtaskPacket({
      subtask_id: "subtask-004",
      expert: "typescript-expert",
      contract_ref: "contract-004",
      environment_ref: "env-004",
      instruction: "Implement the route handler.",
    });

    expect(packet.depends_on).toEqual([]);
    expect(packet.context).toEqual({});
    expect(packet.constraints).toEqual([]);
    expect(packet.validation_hooks).toEqual([]);
  });
});

describe("SubtaskResponse", () => {
  it("copies response payload fields and defaults to an empty object", () => {
    expect(new SubtaskResponse()).toEqual({});
    expect(
      new SubtaskResponse({
        status: "ok",
        artifacts: ["src/app/main.ts"],
      }),
    ).toMatchObject({
      status: "ok",
      artifacts: ["src/app/main.ts"],
    });
  });
});
