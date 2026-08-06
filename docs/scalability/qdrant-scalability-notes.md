# Qdrant scalability notes

## Current implementation

The knowledge ingestion path now creates the Qdrant collection with explicit HNSW tuning and payload schema entries for the fields used in metadata filtering:

- path
- section
- sprint
- feature_area
- source_type
- module

The search path also sends an explicit `params.hnsw_ef` value derived from the requested limit so retrieval can trade a bit more recall/latency headroom for larger result sets.

## Local benchmark snapshot

Measured locally against a Qdrant instance running on `http://localhost:6333` with the benchmark script in `scripts/qdrant-benchmark.mjs`:

- 200 synthetic points upserted in 59.37 ms
- indexing throughput of about 3368 points/sec
- unfiltered search latency of about 3.97 ms

These numbers are useful for regression checks but should not be treated as production capacity guarantees. They were generated from a small synthetic corpus and should be rerun on representative repositories before making broader scaling claims.
