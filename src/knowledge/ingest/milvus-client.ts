import { MilvusClient, DataType } from "@zilliz/milvus2-sdk-node";

export const KNOWLEDGE_COLLECTION = "knowledge_chunks";
const MILVUS_ADDRESS = process.env.MILVUS_ADDRESS ?? "localhost:19530";

let _client: MilvusClient | null = null;

export function getMilvusClient(): MilvusClient {
  if (!_client) {
    _client = new MilvusClient({ address: MILVUS_ADDRESS });
  }
  return _client;
}

export async function ensureKnowledgeCollection(): Promise<void> {
  const client = getMilvusClient();
  const exists = await client.hasCollection({
    collection_name: KNOWLEDGE_COLLECTION,
  });
  if (exists.value) return;

  await client.createCollection({
    collection_name: KNOWLEDGE_COLLECTION,
    fields: [
      {
        name: "chunk_id",
        data_type: DataType.VarChar,
        is_primary_key: true,
        max_length: 256,
      },
      { name: "doc_id", data_type: DataType.VarChar, max_length: 256 },
      { name: "source_type", data_type: DataType.VarChar, max_length: 64 },
      { name: "sprint", data_type: DataType.Int64 },
      { name: "module", data_type: DataType.VarChar, max_length: 128 },
      { name: "feature_area", data_type: DataType.VarChar, max_length: 128 },
      { name: "version", data_type: DataType.VarChar, max_length: 64 },
      { name: "path", data_type: DataType.VarChar, max_length: 512 },
      { name: "section", data_type: DataType.VarChar, max_length: 256 },
      { name: "importance", data_type: DataType.Float },
      { name: "hash", data_type: DataType.VarChar, max_length: 64 },
      { name: "created_at", data_type: DataType.Int64 },
      { name: "dense_vector", data_type: DataType.FloatVector, dim: 1024 },
    ],
  });

  await client.createIndex({
    collection_name: KNOWLEDGE_COLLECTION,
    field_name: "dense_vector",
    index_type: "HNSW",
    metric_type: "COSINE",
    params: { M: 16, efConstruction: 256 },
  });

  await client.loadCollection({ collection_name: KNOWLEDGE_COLLECTION });
}
