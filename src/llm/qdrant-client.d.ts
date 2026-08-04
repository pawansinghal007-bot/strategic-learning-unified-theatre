export interface SearchChunkResult {
  id: string | number;
  path?: string;
  source?: string;
  content: string;
  section: string;
  feature_area: string;
  sprint: number;
  source_type: string;
  score: number;
}

export function searchChunks(
  vector: number[],
  limit?: number,
  scoreThreshold?: number,
): Promise<SearchChunkResult[]>;
