export interface SearchChunkResult {
  /**
   * The chunk's semantic chunk_id (extracted from the Qdrant point payload),
   * not the internal Qdrant point UUID.  This matches the `id` field returned
   * by lexical-index.js so that fuseHybridResults() can correctly merge hits
   * from both arms of the hybrid search.
   */
  id: string;
  path?: string;
  source?: string;
  content: string;
  section: string;
  feature_area: string;
  sprint: number;
  source_type: string;
  score: number;
}

export function queryTopK(
  text: string,
  k?: number,
): Promise<SearchChunkResult[]>;

export function searchChunks(
  vector: number[],
  limit?: number,
  scoreThreshold?: number,
  filters?: Record<string, string | number | string[]>,
): Promise<SearchChunkResult[]>;
