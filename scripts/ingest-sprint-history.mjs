import "dotenv/config";

import { pathToFileURL } from "node:url";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";

mkdirSync(".tmp", { recursive: true });

const outfile = path.join(
  path.resolve(".tmp"),
  "strategic-learning-ingest-sprint-history.mjs",
);
const baseDir = process.argv[2] ?? "./sprints";

await build({
  entryPoints: ["src/knowledge/ingest/ingest-sprint-history.ts"],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  packages: "external",
  logLevel: "silent",
});

const { ingestSprintHistory } = await import(pathToFileURL(outfile).href);
await ingestSprintHistory({ baseDir });
