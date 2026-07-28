import { describe, it, expect } from "vitest";

const RUN_DOCKER = process.env.RUN_DOCKER_TESTS === "true";
const maybeDescribe = RUN_DOCKER ? describe : describe.skip;

maybeDescribe("Postgres docker integration — migrations + symbol search", () => {
  it("applies migrations idempotently against the containerized Postgres", async () => {
    const { runMigrations } = await import("../../src/storage/run-migrations.js");
    await expect(runMigrations(process.env.DATABASE_URL)).resolves.not.toThrow();
    // Re-run to prove the schema_migrations idempotency contract documented
    // in run-migrations.ts's own JSDoc — second run must also be a safe no-op.
    await expect(runMigrations(process.env.DATABASE_URL)).resolves.not.toThrow();
  });

  it("symbol-search can query the real, migrated symbols table over DATABASE_URL", async () => {
    const { findSymbolDefinition } = await import(
      "../../src/shared/retrieval/symbol-search.js"
    );
    // A random, non-existent repositoryId against a real table returns [];
    // against a missing table or bad connection it throws instead — this is
    // the actual proof the migration created the schema symbol-search expects.
    const results = await findSymbolDefinition(
      "doesNotExist",
      "00000000-0000-0000-0000-000000000000",
    );
    expect(results).toEqual([]);
  });
});
