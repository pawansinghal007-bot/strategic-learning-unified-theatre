import { describe, expect, it } from "vitest";
import { javaExpertPersona } from "../../src/agatsya/personas/java-expert.ts";
import { typescriptExpertPersona } from "../../src/agatsya/personas/typescript-expert.ts";

describe("Agatsya personas", () => {
  it("exports the Java expert persona prompt", () => {
    expect(javaExpertPersona).toContain("Java expert");
    expect(javaExpertPersona).toContain("practical implementation");
    expect(javaExpertPersona).toContain("maintainability");
  });

  it("exports the TypeScript expert persona prompt", () => {
    expect(typescriptExpertPersona).toContain("TypeScript expert");
    expect(typescriptExpertPersona).toContain("type safety");
    expect(typescriptExpertPersona).toContain("robust implementation");
  });
});
