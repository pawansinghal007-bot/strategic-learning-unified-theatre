import "dotenv/config";

import { mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const baseDir = process.argv[2] ?? process.cwd();
const defaultFeatureArea = process.argv[3];
const outfile = path.join(
  path.resolve(".tmp"),
  "strategic-learning-ingest-repository.mjs",
);

mkdirSync(".tmp", { recursive: true });

await build({
  entryPoints: ["src/knowledge/ingest/ingest-repository.js"],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  packages: "external",
  logLevel: "silent",
});

const { ingestRepository } = await import(pathToFileURL(outfile).href);
await ingestRepository({ baseDir, defaultFeatureArea });
