from qdrant_client import QdrantClient
import ollama

COLLECTION = "repo_index"
client = QdrantClient(url="http://192.168.176.1:6333")

def embed(q):
    return ollama.embeddings(model="bge-m3:latest", prompt=q)["embedding"]

while True:
    q = input("query> ")
    v = embed(q)

    res = client.search(
        collection_name=COLLECTION,
        query_vector=v,
        limit=5
    )

    for r in res:
        print("\nFILE:", r.payload["file"])
        print(r.payload["text"][:300])
        print("-"*50)
