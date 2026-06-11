let _pipeline: any = null;

async function getEmbedder(): Promise<any> {
  if (!_pipeline) {
    const { pipeline } = await import("@xenova/transformers");
    _pipeline = await pipeline("feature-extraction", "Xenova/bge-m3");
  }
  return _pipeline;
}

export async function embedTextBatch(texts: string[]): Promise<number[][]> {
  const embedder = await getEmbedder();
  const vectors: number[][] = [];

  for (const text of texts) {
    const output = await embedder(text, { pooling: "mean", normalize: true });
    vectors.push(Array.from(output.data as Float32Array));
  }

  return vectors;
}
