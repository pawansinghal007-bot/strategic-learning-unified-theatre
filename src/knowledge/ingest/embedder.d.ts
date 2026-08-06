export declare function embedText(text: string): Promise<number[]>;
export declare function embedTextBatch(texts: string[]): Promise<number[][]>;
export declare function embedChunksWithCache(chunks: Array<{ text: string; hash?: string }>): Promise<number[][]>;
export declare function getEmbeddingCacheStats(): {
  hits: number;
  misses: number;
  size: number;
};
