# V12 — Qdrant Indexing Freshness

**Engine**: Engine 3 (Knowledge Graph)
**Question**: How is re-indexing triggered (manual run, file-watch, scheduled job)? How are stale/duplicate entries handled?

---

## Commands Run

```bash
# 1. Read index_repo.py (full file)
cat index_repo.py

# 2. Read src/llm/qdrant-client.js (full file)
cat src/llm/qdrant-client.js

# 3. Read src/llm/qdrant-client.ts (full file)
cat src/llm/qdrant-client.ts

# 4. Read src/knowledge/ingest/ingest-repository.js (full file)
cat src/knowledge/ingest/ingest-repository.js

# 5. Read src/knowledge/ingest/ingest-sprint-history.js (full file)
cat src/knowledge/ingest/ingest-sprint-history.js

# 6. Read src/knowledge/index.ts (full file)
cat src/knowledge/index.ts

# 7. Read scripts/ingest-repository.mjs (full file)
cat scripts/ingest-repository.mjs

# 8. Search for file watchers / schedulers / cron / setInterval in knowledge/
grep -rn "watch|watcher|fs\.watch|chokidar|schedule|cron|setInterval|reindex|re-index" src/knowledge/

# 9. Search for ingestRepository imports in src/commands/
grep -rn "ingestRepository|ingest-repository" src/commands/

# 10. Search for index_repo.py invocation from scripts/CLI
grep -rn "index_repo|python.*index|scan_repo" **/*.{sh,ps1,json,yaml,yml}

# 11. Search for periodic/scheduled indexing
grep -rn "setInterval|cron|schedule|timer.*ingest|periodic.*index" src/**/*.{js,ts}

# 12. Read src/commands/storage.js (full file)
cat src/commands/storage.js

# 13. Read src/storage/storage-monitor.js (indexAll + watch methods)
cat src/storage/storage-monitor.js

# 14. Read src/commands/bc2-sync.js (schedule section)
cat src/commands/bc2-sync.js
```

## Terminal Output

**Command 8 — File watchers in knowledge/:**

```
(no matches)
```

**Command 9 — ingestRepository in src/commands/:**

```
(no matches)
```

**Command 10 — index_repo.py invocation from scripts:**

```
(no matches — only audit CSV files reference index_repo.py)
```

**Command 11 — Scheduled indexing in src/:**

```
src/commands/bc2-sync.js:12:const SCHEDULE_INTERVAL_MS = 5 * 60 * 1000;
src/commands/bc2-sync.js:149:  if (!schedule) {
src/commands/bc2-sync.js:160:  const timer = setInterval(async () => {
src/daemon/daemon-runner.js:110:  reportTimer = setInterval(async () => {
src/internal/git-monitor.js:159:    this.timer = setInterval(() => {
```

(bc2-sync schedules DocumentIngester, not Qdrant. Git-monitor polls git status. Daemon-runner reports health. None trigger Qdrant indexing.)

**Command 12 — storage.js commands:**

```
storage watch   → chokidar watcher → DocumentIngester (SQLite, not Qdrant)
storage status  → recent changes from snapshot
storage index   → StorageMonitor.indexAll() (snapshot only, not Qdrant)
```

## Code Evidence

### `index_repo.py` — Manual CLI entry point (lines 256-268)

```python
if __name__ == "__main__":
    init_collection()
    count = 0
    for file in scan_repo():
        index_file(file)
        count += 1
    print()
    print(f"Indexed {count} files")
    print("DONE")
```

**Observation**: Pure manual invocation (`python index_repo.py`). No scheduler, no file watcher, no incremental logic. Full re-scan every time.

### `index_repo.py` — Stale entry handling: delete-then-upsert per file (lines 166-218)

```python
def remove_existing_file(path):
    client.delete(
        collection_name=COLLECTION,
        points_selector=Filter(
            must=[
                FieldCondition(
                    key="file",
                    match=MatchValue(value=path),
                )
            ]
        ),
    )

def index_file(path):
    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            text = f.read()
        if not text.strip():
            return
        chunks = chunk_text(text)
        remove_existing_file(path)  # ← Delete old chunks first
        points = []
        for i, chunk in enumerate(chunks):
            vector = embed(chunk)
            points.append(PointStruct(
                id=chunk_id(path, i),
                vector=vector,
                payload={"file": path, "chunk": i, "text": chunk},
            ))
        client.upsert(collection_name=COLLECTION, points=points)
    except Exception as e:
        print(f"Failed: {path}")
        print(e)
```

**Observation**: Stale entries handled by deleting all chunks for a file before upserting new ones. No deduplication — relies on delete-then-insert. No cross-file dedup.

### `src/knowledge/ingest/ingest-repository.js` — Incremental ingestion with hash comparison (lines 285-370)

```javascript
export async function ingestRepository(options) {
  const { baseDir, defaultFeatureArea } = options;
  const absoluteBaseDir = path.resolve(baseDir);
  const effectiveMaxFileBytes = getEffectiveMaxFileBytes(options);

  await ensureKnowledgeCollection();

  // Fetch existing file hashes from Qdrant for incremental ingestion
  const existingHashes = await getExistingFileHashes();

  const { files, skippedLargeFiles } = await discoverSupportedFiles(
    absoluteBaseDir,
    effectiveMaxFileBytes,
  );

  // Build a map of docId -> fileHash for all files currently on disk
  const currentFiles = new Map();
  for (const filePath of files) {
    try {
      const text = await fs.readFile(filePath, "utf8");
      const relativePath = path.relative(absoluteBaseDir, filePath);
      const docId = `repo:${relativePath.split(path.sep).join("/")}`;
      const fileHash = computeFileHash(text);
      currentFiles.set(docId, fileHash);
    } catch (err) {
      console.warn(`[knowledge] Skipping ${filePath}: ${err}`);
    }
  }

  // Clean up deleted files: docIds in Qdrant but not on disk
  for (const [docId] of existingHashes) {
    if (!currentFiles.has(docId)) {
      console.log(`[knowledge] Deleting chunks for removed file: ${docId}`);
      await deleteChunksByDocId(docId);
    }
  }

  // Process each file: skip unchanged, delete+re-ingest changed
  for (const [docId, chunks] of fileChunksMap) {
    const currentHash = currentFiles.get(docId);
    const existingHash = existingHashes.get(docId);

    if (existingHash === currentHash) {
      skippedFiles++;
      continue; // ← Skip unchanged files
    }

    // File is new or changed
    if (existingHash && existingHash !== currentHash) {
      console.log(`[knowledge] Updating changed file: ${docId}`);
      await deleteChunksByDocId(docId); // ← Delete old chunks
    }

    await attachVectors(chunks);
    const insertedCount = await insertChunkBatch(null, chunks);
    totalChunks += insertedCount;
  }
}
```

**Observation**: Production ingest is incremental. Three strategies: (1) skip unchanged files (hash match), (2) delete+re-ingest changed files (hash mismatch), (3) delete chunks for removed files (in Qdrant but not on disk).

### `src/knowledge/ingest/ingest-repository.js` — CLI entry point (lines 373-388)

```javascript
async function main() {
  if (process.env.VITEST) return;
  const baseDir = process.argv[2] ?? process.cwd();
  const defaultFeatureArea = process.argv[3];
  try {
    await ingestRepository({ baseDir, defaultFeatureArea });
  } catch (err) {
    console.error("[knowledge] Repository ingestion failed:", err);
    process.exitCode = 1;
  }
}

if (isDirectRun()) {
  await main();
}
```

**Observation**: Manual invocation only. No scheduler, no file watcher, no auto-trigger.

### `scripts/ingest-repository.mjs` — Build + run wrapper (lines 1-26)

```javascript
import { build } from "esbuild";
// ...
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
```

**Observation**: Bundles with esbuild then runs. Still manual invocation.

### `src/llm/qdrant-client.js` — getExistingFileHashes (lines 113-160)

```javascript
export async function getExistingFileHashes() {
  const hashes = new Map();
  let next_page_offset = undefined;
  do {
    const body = {
      limit: 100,
      with_payload: ["doc_id", "file_hash"],
      with_vector: false,
    };
    if (next_page_offset) {
      body.offset = next_page_offset;
    }
    const res = await fetch(
      `${QDRANT_URL}/collections/${KNOWLEDGE_COLLECTION}/points/scroll`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    // ... parse points, extract doc_id + file_hash ...
    next_page_offset = data.result?.next_page_offset;
  } while (next_page_offset);
  return hashes;
}
```

**Observation**: Scrolls entire collection to build hash map. O(N) on collection size — no index on doc_id/file_hash mentioned.

### `src/llm/qdrant-client.js` — deleteChunksByDocId (lines 164-195)

```javascript
export async function deleteChunksByDocId(docId) {
  if (!docId) {
    throw new Error("deleteChunksByDocId: docId must be a non-empty string");
  }
  const res = await fetch(
    `${QDRANT_URL}/collections/${KNOWLEDGE_COLLECTION}/points/delete`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filter: { must: [{ key: "doc_id", match: { value: docId } }] },
      }),
    },
  );
  if (!res.ok) {
    throw new Error("Failed to delete chunks");
  }
}
```

**Observation**: Deletes all chunks matching a doc_id. Used for both "file changed" and "file deleted" scenarios.

### `src/commands/storage.js` — storage watch (lines 12-38)

```javascript
storage
  .command("watch")
  .description("Start the storage watcher in the foreground")
  .action(async () => {
    const monitor = new StorageMonitor();
    await monitor.indexAll();
    monitor.onIngestibleChange = async (changes) => {
      const ingester = new DocumentIngester();
      for (const change of changes) {
        if (change.event === "unlink") continue;
        await ingester.ingestPath(change.path);
      }
    };
    await monitor.watch();
  });
```

**Observation**: File watcher triggers `DocumentIngester.ingestPath()` (SQLite-based), NOT `ingestRepository()` (Qdrant-based). Storage watcher and Qdrant indexing are completely disjoint.

### `src/commands/bc2-sync.js` — Scheduled sync (lines 149-175)

```javascript
if (!schedule) {
  return runOnce();
}
const timer = setInterval(async () => {
  if (active) return;
  active = true;
  try {
    await runOnce(); // → DocumentIngester.ingestChunks (SQLite, not Qdrant)
  } catch (error) {
    console.error(chalk.red(String(error?.message ?? error)));
  } finally {
    active = false;
  }
}, SCHEDULE_INTERVAL_MS); // 5 minutes
```

**Observation**: 5-minute scheduled sync uses DocumentIngester (SQLite), not Qdrant. No scheduled Qdrant indexing exists.

### No file watcher or scheduler triggers Qdrant indexing

```
grep result: Zero matches for ingestRepository imports in src/commands/.
grep result: Zero matches for file watchers in src/knowledge/.
grep result: Zero matches for index_repo.py invocation from scripts/CLI.
```

## Verdict

**Missing**

## Notes

Qdrant indexing has **no automated trigger**. Both ingestion paths are manual:

1. **`index_repo.py`** — Legacy Python script. Full re-scan every run. Delete-then-upsert per file. No incremental logic. No scheduler.
2. **`src/knowledge/ingest/ingest-repository.js`** — Production JS ingest. Incremental via SHA-256 file hash comparison. Skips unchanged, deletes+re-ingests changed, deletes removed files. Triggered only by direct CLI invocation (`node ingest-repository.js`) or the esbuild wrapper (`scripts/ingest-repository.mjs`).

**Stale/duplicate handling:**

- `index_repo.py`: Delete all chunks for a file before upserting. No dedup.
- `ingest-repository.js`: Hash-based incremental. Deleted files cleaned up. Changed files re-ingested. Unchanged files skipped.

**Critical gap:** The storage watcher (`storage watch`) and bc2-sync scheduler both use `DocumentIngester` (SQLite), not Qdrant. There is no file-watcher→Qdrant pipeline, no scheduled Qdrant re-index, and no CLI command in `src/commands/` that calls `ingestRepository`. The Qdrant index only gets updated when someone manually runs the ingest script — meaning it can become stale indefinitely.

This directly explains the Qdrant/MCP integration friction: the vector store is not kept fresh by any automated mechanism.
---

## Comment by Grok

**Independent re-check (2026-07-21): Agree with verdict — Missing (for automated freshness).**

Confirmed:
- `index_repo.py` is a manual `__main__` full re-scan with delete-then-upsert per file
- `qdrant-client.js/.ts` expose `upsertChunks` / `deleteChunksByDocId` (client API, not a scheduler)
- No file-watch / cron / daemon path found that keeps Qdrant fresh

Verdict wording “Missing” applies to *automated freshness triggers*, not to the existence of index code. Notes correctly distinguish manual ingest paths. No material corrections to the conclusion.
