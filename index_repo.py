import os
from qdrant_client import QdrantClient
from qdrant_client.models import VectorParams, Distance, PointStruct
import ollama
import uuid

# CONFIG
REPO_PATH = "."
COLLECTION = "repo_index"
QDRANT_URL = "http://192.168.176.1:6333"
MODEL = "bge-m3:latest"

client = QdrantClient(url=QDRANT_URL)

# create collection if not exists
def init_collection(dim=1024):
    if not client.collection_exists(COLLECTION):
        client.create_collection(
            collection_name=COLLECTION,
            vectors_config=VectorParams(
                size=dim,
                distance=Distance.COSINE
            )
        )

# chunk file
def chunk_text(text, chunk_size=1000):
    return [text[i:i+chunk_size] for i in range(0, len(text), chunk_size)]

# embed using Ollama
def embed(text):
    res = ollama.embeddings(
        model=MODEL,
        prompt=text
    )
    return res["embedding"]

def index_file(path):
    try:
        with open(path, "r", errors="ignore") as f:
            text = f.read()

        chunks = chunk_text(text)

        points = []
        for i, chunk in enumerate(chunks):
            vector = embed(chunk)

            points.append(
                PointStruct(
                    id=str(uuid.uuid4()),
                    vector=vector,
                    payload={
                        "file": path,
                        "chunk": i,
                        "text": chunk
                    }
                )
            )

        client.upsert(collection_name=COLLECTION, points=points)
        print(f"Indexed: {path}")

    except Exception as e:
        print("Failed:", path, e)

def scan_repo():
    for root, _, files in os.walk(REPO_PATH):
        for file in files:
            if file.endswith((".py", ".ts", ".js", ".md", ".txt")):
                yield os.path.join(root, file)

if __name__ == "__main__":
    init_collection()

    for file in scan_repo():
        index_file(file)

    print("DONE")
