import { indexSymbols } from "./symbol-indexer.js";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const result = await indexSymbols(url, process.cwd());
console.log(`Indexed ${result.symbolsInserted} symbols across ${result.filesProcessed} files.`);
