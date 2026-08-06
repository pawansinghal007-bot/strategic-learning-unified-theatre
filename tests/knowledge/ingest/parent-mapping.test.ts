import { describe, it, expect } from "vitest";
import {
  createChunksForFile,
  codeParentNodes,
  markdownParentNodes,
  findParentForOffset,
} from "../../../src/knowledge/ingest/ingest-repository.js";

describe("ingest-repository parent mapping", () => {
  it("maps markdown headings to parent sections and assigns parentText", () => {
    const text = "# Top\n\nIntro text.\n\n## Subsection\n\nMore details here.";
    const docId = "repo:docs/test.md";

    const parents = markdownParentNodes(text, docId);
    expect(parents).toHaveLength(2);
    expect(parents[0]).toMatchObject({
      parentId: `${docId}:parent:section:top`,
      parentText: expect.stringContaining("# Top"),
    });
    expect(parents[1]).toMatchObject({
      parentId: `${docId}:parent:section:subsection`,
      parentText: expect.stringContaining("## Subsection"),
    });

    const parentForFirst = findParentForOffset(parents, text.indexOf("Intro"));
    expect(parentForFirst?.parentId).toBe(`${docId}:parent:section:top`);

    const parentForSecond = findParentForOffset(
      parents,
      text.indexOf("More details"),
    );
    expect(parentForSecond?.parentId).toBe(
      `${docId}:parent:section:subsection`,
    );
  });

  it("maps code nodes to parent functions and classes", () => {
    const text = `export function add(a, b) { return a + b; }\n\nclass Greeter {\n  greet() { return 'hi'; }\n}`;
    const docId = "repo:src/example.ts";

    const parents = codeParentNodes(text, docId, "src/example.ts");
    expect(
      parents.some((parent) => parent.parentId === `${docId}:parent:add`),
    ).toBe(true);
    expect(
      parents.some(
        (parent) => parent.parentId === `${docId}:parent:Greeter.greet`,
      ),
    ).toBe(true);

    const addParent = parents.find(
      (parent) => parent.parentId === `${docId}:parent:add`,
    );
    expect(addParent?.parentText).toContain("export function add");

    const greetParent = parents.find(
      (parent) => parent.parentId === `${docId}:parent:Greeter.greet`,
    );
    expect(greetParent?.parentText).toContain("greet()");

    const parentForAdd = findParentForOffset(
      parents,
      text.indexOf("return a + b"),
    );
    expect(parentForAdd?.parentId).toBe(`${docId}:parent:add`);

    const parentForGreet = findParentForOffset(
      parents,
      text.indexOf("return 'hi'"),
    );
    expect(parentForGreet?.parentId).toBe(`${docId}:parent:Greeter.greet`);
  });

  it("creates chunks with parentId and parentText for markdown documents", () => {
    const text = "# Section A\n\nChild text here.";
    const chunks = createChunksForFile({
      text,
      filePath: "docs/test.md",
      absoluteBaseDir: "/tmp/project",
      defaultFeatureArea: "docs",
    });

    expect(chunks).toHaveLength(1);
    expect(chunks[0].parentId).toBe(
      "repo:docs/test.md:parent:section:section-a",
    );
    expect(chunks[0].section).toBe(chunks[0].parentId);
    expect(chunks[0].parentText).toContain("# Section A");
  });

  it("creates chunks with parentId and parentText for code documents", () => {
    const text = "function test() { return 1; }";
    const chunks = createChunksForFile({
      text,
      filePath: "src/test.js",
      absoluteBaseDir: "/tmp/project",
      defaultFeatureArea: "src",
    });

    expect(chunks).toHaveLength(1);
    expect(chunks[0].parentId).toBe("repo:src/test.js:parent:test");
    expect(chunks[0].section).toBe(chunks[0].parentId);
    expect(chunks[0].parentText).toContain("function test");
  });
});
